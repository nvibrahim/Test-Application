import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import {
  describePasswordProblem,
  evaluatePassword,
  type PasswordContext,
  type PasswordEvaluation,
  type PasswordProblem,
  type PasswordRules,
} from '@inspower/shared';
import { LOGGER } from '../../platform/logging/logging.module';
import type { Logger } from '../../platform/logging/logger';
import { PrismaService, type Tx } from '../../platform/database/prisma.service';

/** Argon2id, 64 MiB, 3 iterations. Rehash on sign-in when these change. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
} as const;

/** A valid hash of a random value, verified for unknown emails so timing does not reveal them. */
let dummyHash: string | undefined;

@Injectable()
export class PasswordsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  /** Spends the same time as a real verification, for emails that do not exist. */
  async verifyDummy(password: string): Promise<void> {
    dummyHash ??= await argon2.hash('dummy-password-for-constant-time', ARGON2_OPTIONS);
    await argon2.verify(dummyHash, password).catch(() => undefined);
  }

  /**
   * Have I Been Pwned range search: only the first five characters of the SHA-1 leave the
   * server. Any network problem means "not known to be breached" and is logged, never shown.
   */
  async isBreached(password: string, timeoutMs = 2500): Promise<boolean> {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'inspower-core' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return false;
      const body = await res.text();
      return body
        .split('\n')
        .some((line) => line.startsWith(suffix) && !line.trim().endsWith(':0'));
    } catch (error) {
      this.logger.debug({ err: error }, 'breached-password check skipped');
      return false;
    }
  }

  /** The full policy: shared rules, then the breached list, then the person's own history. */
  async evaluateForUser(
    password: string,
    rules: PasswordRules,
    context: PasswordContext,
    userId: string | null,
    tx: Tx | PrismaService = this.prisma,
  ): Promise<PasswordEvaluation> {
    const result = evaluatePassword(password, rules, context);
    const problems: PasswordProblem[] = [...result.problems];
    if (result.ok && rules.breachedPasswordCheck && (await this.isBreached(password))) {
      problems.push({ code: 'breached' });
    }
    if (result.ok && userId && rules.historyCount > 0) {
      const history = await tx.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: rules.historyCount,
        select: { passwordHash: true },
      });
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      const hashes = [current?.passwordHash, ...history.map((h) => h.passwordHash)].filter(
        (h): h is string => !!h,
      );
      for (const h of hashes) {
        if (await this.verify(h, password)) {
          problems.push({ code: 'reused' });
          break;
        }
      }
    }
    return { ok: problems.length === 0, score: result.score, problems };
  }

  describe(evaluation: PasswordEvaluation): string[] {
    return evaluation.problems.map(describePasswordProblem);
  }

  /** Writes the new hash, remembers the old one and trims the history to the rule. */
  async setPassword(
    tx: Tx,
    userId: string,
    organizationId: string,
    newHash: string,
    historyCount: number,
  ): Promise<void> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (user.passwordHash) {
      await tx.passwordHistory.create({
        data: { userId, organizationId, passwordHash: user.passwordHash },
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        lockedUntil: null,
      },
    });
    const keep = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: Math.max(historyCount, 0),
      select: { id: true },
    });
    if (keep.length)
      await tx.passwordHistory.deleteMany({ where: { id: { in: keep.map((k) => k.id) } } });
  }
}
