import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { StepUpRequest, StepUpStatus } from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException } from '../../platform/http/api-error';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { PasswordsService } from '../auth/passwords.service';
import { SecuritySettingsService } from '../auth/security-settings';
import { TwoFactorActions } from './two-factor.actions';
import { TwoFactorService } from './two-factor.service';

const MAX_FAILURES = 5;

/**
 * Sensitive actions need proof within the last N minutes (Settings -> Security, default 10):
 * the password, or a code from the authenticator app. Grants live in `step_up_grants`, so they
 * survive a restart and are auditable. Five wrong tries end the session.
 */
@Injectable()
export class StepUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly passwords: PasswordsService,
    private readonly security: SecuritySettingsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async status(auth: AuthContext): Promise<StepUpStatus> {
    const grant = await this.prisma.stepUpGrant.findFirst({
      where: { sessionId: auth.sessionId, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
    const enabled = await this.twoFactor.isEnabled(auth.userId);
    return {
      active: !!grant,
      expiresAt: grant?.expiresAt.toISOString() ?? null,
      methods: enabled ? ['password', 'totp'] : ['password'],
    };
  }

  async hasGrant(sessionId: string): Promise<boolean> {
    const grant = await this.prisma.stepUpGrant.findFirst({
      where: { sessionId, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return !!grant;
  }

  async verify(req: Request, auth: AuthContext, input: StepUpRequest): Promise<StepUpStatus> {
    const settings = await this.security.read(auth.organizationId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    let ok = false;
    let method: 'password' | 'totp' = 'password';
    if (input.password) {
      ok = !!user.passwordHash && (await this.passwords.verify(user.passwordHash, input.password));
    } else if (input.code) {
      method = 'totp';
      ok = await this.twoFactor.checkCodeForUser(auth.userId, input.code);
    }
    if (!ok) {
      const failures = await this.countFailure(auth.sessionId);
      await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
        audit({
          action: TwoFactorActions.stepUpFailed,
          entityType: 'session',
          entityId: auth.sessionId,
          changes: { method, failures },
        }),
      );
      if (failures >= MAX_FAILURES) {
        await this.prisma.session.update({
          where: { id: auth.sessionId },
          data: { revokedAt: new Date(), revokedReason: 'step_up_failures' },
        });
        throw new ApiException('unauthenticated', 'Too many wrong attempts. Sign in again.');
      }
      throw new ApiException(
        'invalid_credentials',
        method === 'totp' ? 'That code is not right' : 'The password is wrong',
      );
    }
    const expiresAt = new Date(Date.now() + settings.stepUpMinutes * 60_000);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.stepUpGrant.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          sessionId: auth.sessionId,
          method,
          expiresAt,
        },
      });
      await audit({
        action: TwoFactorActions.stepUpVerified,
        entityType: 'session',
        entityId: auth.sessionId,
        changes: { method },
      });
    });
    await this.prisma.stepUpGrant.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return this.status(auth);
  }

  private readonly failures = new Map<string, number>();
  private async countFailure(sessionId: string): Promise<number> {
    const n = (this.failures.get(sessionId) ?? 0) + 1;
    this.failures.set(sessionId, n);
    setTimeout(() => this.failures.delete(sessionId), 15 * 60_000).unref();
    return n;
  }
}
