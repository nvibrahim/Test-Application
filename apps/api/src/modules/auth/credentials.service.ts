import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { type SessionStage, type SignInRequest, type SignInResponse } from '@inspower/shared';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException } from '../../platform/http/api-error';
import { QueueService } from '../../platform/jobs/queue.service';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { type AuthContext, clientIp, userAgentOf } from '../access/request-context';
import { OrganizationService } from '../organization/organization.service';
import { AuthActions } from './auth.actions';
import { PasswordsService } from './passwords.service';
import { SecuritySettingsService } from './security-settings';
import { SessionsService } from './sessions.service';
import { ThrottleService } from './throttle.service';
import { NotificationsService } from '../notifications/notifications.service';
import { trustedTokenFrom } from '../two-factor/trusted-cookie';
import { hashToken } from '../../platform/crypto/crypto';
import { deviceLabel } from './sessions.service';

@Injectable()
export class CredentialsService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly passwords: PasswordsService,
    private readonly throttle: ThrottleService,
    private readonly sessions: SessionsService,
    private readonly security: SecuritySettingsService,
    private readonly organizations: OrganizationService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Order of checks: throttle (fail closed) -> constant-time path for unknown emails ->
   * database lock -> password -> account status. Every outcome is audited and counted.
   */
  async signIn(req: Request, res: Response, input: SignInRequest): Promise<SignInResponse> {
    const organizationId = await this.organizations.currentId();
    if (!organizationId)
      throw new ApiException(
        'setup_required',
        'No administrator exists yet. Run: pnpm inspower admin create',
      );
    const settings = await this.security.read(organizationId);
    const ip = clientIp(req);
    const userAgent = userAgentOf(req);
    const emailNormalized = input.email;

    await this.throttle.checkIp(ip, settings);

    const user = await this.prisma.user.findUnique({
      where: { organizationId_emailNormalized: { organizationId, emailNormalized } },
      include: { twoFactor: { select: { confirmedAt: true } } },
    });

    const attempt = async (succeeded: boolean, reason: string | null, userId: string | null) => {
      await this.prisma.loginAttempt.create({
        data: { organizationId, emailNormalized, userId, ip, userAgent, succeeded, reason },
      });
    };

    if (!user || !user.passwordHash) {
      await this.passwords.verifyDummy(input.password);
      const count = await this.throttle.recordFailure(emailNormalized, settings);
      await attempt(false, 'unknown_email', null);
      await sleep(this.throttle.delayFor(count, settings));
      throw new ApiException('invalid_credentials', 'Wrong email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await attempt(false, 'locked', user.id);
      throw new ApiException(
        'account_locked',
        'Too many wrong passwords. Try again later or reset your password.',
        {
          until: user.lockedUntil.toISOString(),
        },
      );
    }

    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) {
      const count = await this.throttle.recordFailure(emailNormalized, settings);
      await attempt(false, 'wrong_password', user.id);
      if (count >= settings.lockout.lockAfterAttempts) {
        const lockedUntil = new Date(Date.now() + settings.lockout.lockMinutes * 60_000);
        await this.transactions.run(
          { organizationId, actorId: null, ip, userAgent, requestId: requestIdOf(req) },
          async ({ tx, audit }) => {
            await tx.user.update({ where: { id: user.id }, data: { lockedUntil } });
            await this.notifications.notifyAdmins(tx, organizationId, {
              type: 'admin.security_lockout',
              title: `${user.fullName}'s account was locked`,
              body: `${count} wrong passwords in a row.`,
              link: `/admin/users/${user.id}`,
              adminEvent: 'security.lockout',
            });
            await audit({
              action: AuthActions.loginLocked,
              entityType: 'user',
              entityId: user.id,
              changes: { attempts: count, lockedUntil },
            });
          },
        );
        await this.queue.sendEmail(organizationId, user.email, {
          name: 'account-locked',
          params: {
            appName: this.env.APP_NAME,
            fullName: user.fullName,
            minutes: settings.lockout.lockMinutes,
          },
        });
        throw new ApiException(
          'account_locked',
          'Too many wrong passwords. Sign-in is locked for a while; an email was sent.',
          { until: lockedUntil.toISOString() },
        );
      }
      await this.transactions.run(
        { organizationId, actorId: null, ip, userAgent, requestId: requestIdOf(req) },
        ({ audit }) =>
          audit({
            action: AuthActions.loginFailed,
            entityType: 'user',
            entityId: user.id,
            changes: { attempts: count },
          }),
      );
      await sleep(this.throttle.delayFor(count, settings));
      throw new ApiException('invalid_credentials', 'Wrong email or password');
    }

    if (user.status !== 'active') {
      await attempt(false, `status_${user.status}`, user.id);
      throw new ApiException(
        'account_disabled',
        'This account cannot sign in. Ask an administrator.',
      );
    }

    // A trusted device skips the code; the browser proved itself within the trusted-device days.
    const trusted = user.twoFactor?.confirmedAt ? await this.isTrustedDevice(req, user.id) : false;
    const stage: SessionStage =
      user.twoFactor?.confirmedAt && !trusted
        ? 'verify_two_factor'
        : user.mustChangePassword ||
            passwordExpired(user.passwordChangedAt, settings.password.expiryDays)
          ? 'change_password'
          : 'active';
    const label = deviceLabel(userAgent);
    const seenBefore = await this.prisma.session.findFirst({
      where: { userId: user.id, deviceLabel: label, ...(ip ? { ip } : {}) },
      select: { id: true },
    });
    const firstEver = (await this.prisma.session.count({ where: { userId: user.id } })) === 0;

    const needsRehash = this.passwords.needsRehash(user.passwordHash);
    const newHash = needsRehash ? await this.passwords.hash(input.password) : null;

    await this.transactions.run(
      { organizationId, actorId: user.id, ip, userAgent, requestId: requestIdOf(req) },
      async ({ tx, audit }) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            lastSignInAt: new Date(),
            lockedUntil: null,
            ...(newHash ? { passwordHash: newHash } : {}),
          },
        });
        const created = await this.sessions.create(tx, res, {
          organizationId,
          userId: user.id,
          stage,
          rememberMe: input.rememberMe,
          ip,
          userAgent,
          settings,
        });
        await audit({
          action: AuthActions.loginSuccess,
          entityType: 'session',
          entityId: created.id,
          changes: { stage, rememberMe: input.rememberMe, rehashed: needsRehash },
        });
      },
    );
    await this.throttle.clearFailures(emailNormalized);
    await attempt(true, null, user.id);
    if (!seenBefore && !firstEver) {
      await this.queue.sendEmail(organizationId, user.email, {
        name: 'new-device-sign-in',
        params: {
          appName: this.env.APP_NAME,
          fullName: user.fullName,
          device: label ?? 'an unknown device',
          ip,
          when: new Date().toUTCString(),
        },
      });
    }

    const setupComplete = await this.organizations.isSetupComplete(organizationId);
    return { stage, next: nextFor(stage, setupComplete) };
  }

  private async isTrustedDevice(req: Request, userId: string): Promise<boolean> {
    const token = trustedTokenFrom(req, this.env);
    if (!token) return false;
    const row = await this.prisma.trustedDevice.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!row || row.userId !== userId || row.revokedAt || row.expiresAt <= new Date()) return false;
    await this.prisma.trustedDevice.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    return true;
  }

  async signOut(req: Request, res: Response, auth: AuthContext): Promise<void> {
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await this.sessions.revoke(auth.sessionId, 'signed_out', tx);
      await audit({ action: AuthActions.logout, entityType: 'session', entityId: auth.sessionId });
    });
    this.sessions.clearCookie(res);
  }

  /**
   * Changes the password after checking the current one and the policy (shared rules, the
   * breached list and the person's history). Moves a `change_password` session to `active`,
   * signs out every other session and emails a notice.
   */
  async changePassword(
    req: Request,
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ next: SignInResponse['next'] }> {
    const settings = await this.security.read(auth.organizationId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.passwordHash || !(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new ApiException('invalid_credentials', 'The current password is wrong');
    }
    const org = await this.organizations.current();
    const evaluation = await this.passwords.evaluateForUser(
      newPassword,
      settings.password,
      {
        email: user.email,
        fullName: user.fullName,
        organizationName: org?.legalName,
        appName: this.env.APP_NAME,
        isSuperAdmin: auth.isSuperAdmin,
      },
      user.id,
    );
    if (!evaluation.ok)
      throw new ApiException('password_rejected', 'Choose a stronger password', {
        problems: this.passwords.describe(evaluation),
      });

    const hash = await this.passwords.hash(newPassword);
    let revoked = 0;
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await this.passwords.setPassword(
        tx,
        user.id,
        auth.organizationId,
        hash,
        settings.password.historyCount,
      );
      if (auth.stage === 'change_password')
        await this.sessions.setStage(tx, auth.sessionId, 'active');
      revoked = await this.sessions.revokeAllForUser(
        tx,
        user.id,
        'password_changed',
        auth.sessionId,
      );
      await audit({
        action: AuthActions.passwordChanged,
        entityType: 'user',
        entityId: user.id,
        changes: { otherSessionsRevoked: revoked, fromStage: auth.stage },
      });
    });
    await this.queue.sendEmail(auth.organizationId, user.email, {
      name: 'password-changed',
      params: {
        appName: this.env.APP_NAME,
        fullName: user.fullName,
        when: new Date().toUTCString(),
      },
    });

    const setupComplete = await this.organizations.isSetupComplete(auth.organizationId);
    return { next: nextFor('active', setupComplete) };
  }
}

export function nextFor(stage: SessionStage, setupComplete: boolean): SignInResponse['next'] {
  if (stage === 'verify_two_factor') return '/two-factor';
  if (stage === 'change_password') return '/change-password';
  return setupComplete ? '/dashboard' : '/setup';
}

export function passwordExpired(changedAt: Date | null, expiryDays: number): boolean {
  if (!expiryDays) return false;
  if (!changedAt) return true;
  return Date.now() - changedAt.getTime() > expiryDays * 86_400_000;
}

export function ctxOf(req: Request, auth: AuthContext) {
  return {
    organizationId: auth.organizationId,
    actorId: auth.userId,
    ip: clientIp(req),
    userAgent: userAgentOf(req),
    requestId: requestIdOf(req),
  };
}

function requestIdOf(req: Request): string | null {
  return (req as Request & { requestId?: string }).requestId ?? null;
}
