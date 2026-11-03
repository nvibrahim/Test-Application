import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import {
  DEFAULT_APP_NAME,
  type RecoveryCodesResponse,
  type TwoFactorSetupResponse,
  type TwoFactorStatus,
  type TwoFactorVerifyRequest,
} from '@inspower/shared';
import { effectiveKey, type Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { hashToken, hmacCode, newToken, open, seal } from '../../platform/crypto/crypto';
import { PrismaService, type Tx } from '../../platform/database/prisma.service';
import { ApiException, notFound } from '../../platform/http/api-error';
import { QueueService } from '../../platform/jobs/queue.service';
import { RedisService } from '../../platform/redis/redis.service';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { type AuthContext, userAgentOf } from '../access/request-context';
import { ctxOf, nextFor } from '../auth/credentials.service';
import { SecuritySettingsService } from '../auth/security-settings';
import { deviceLabel, SessionsService } from '../auth/sessions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationService } from '../organization/organization.service';
import { checkTotp, formatRecoveryCode, newRecoveryCodes, newTotpSecret, totpUri } from './totp';
import { trustedCookieName, trustedTokenFrom } from './trusted-cookie';
import { TwoFactorActions } from './two-factor.actions';

const SETUP_TTL_SECONDS = 10 * 60;

@Injectable()
export class TwoFactorService {
  readonly trustedCookieName: string;
  private readonly key: Buffer;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly transactions: TransactionService,
    private readonly sessions: SessionsService,
    private readonly security: SecuritySettingsService,
    private readonly organizations: OrganizationService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
  ) {
    this.key = effectiveKey(env, 'AUTH_ENCRYPTION_KEY');
    this.trustedCookieName = trustedCookieName(env);
  }

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.prisma.userTwoFactor.findUnique({
      where: { userId },
      select: { confirmedAt: true },
    });
    return row?.confirmedAt != null;
  }

  async status(req: Request, auth: AuthContext): Promise<TwoFactorStatus> {
    const [row, codesLeft, settings, prefs, devices] = await Promise.all([
      this.prisma.userTwoFactor.findUnique({ where: { userId: auth.userId } }),
      this.prisma.recoveryCode.count({ where: { userId: auth.userId, usedAt: null } }),
      this.security.read(auth.organizationId),
      this.prisma.userPreferences.findUnique({ where: { userId: auth.userId } }),
      this.prisma.trustedDevice.findMany({
        where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const enabled = row?.confirmedAt != null;
    const currentHash = this.trustedTokenFrom(req) ? hashToken(this.trustedTokenFrom(req)!) : null;
    const dismissedAt = prefs?.twoFactorReminderDismissedAt;
    const show =
      !enabled &&
      (!dismissedAt ||
        Date.now() - dismissedAt.getTime() > settings.twoFactor.reminderIntervalDays * 86_400_000);
    return {
      enabled,
      confirmedAt: row?.confirmedAt?.toISOString() ?? null,
      recoveryCodesLeft: enabled ? codesLeft : 0,
      trustedDevices: devices.map((d) => ({
        id: d.id,
        label: d.label,
        current: d.tokenHash === currentHash,
        createdAt: d.createdAt.toISOString(),
        lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
        expiresAt: d.expiresAt.toISOString(),
      })),
      trustedDeviceDays: settings.twoFactor.trustedDeviceDays,
      reminder: { show, intervalDays: settings.twoFactor.reminderIntervalDays },
    };
  }

  /** Makes a secret, keeps it sealed in Redis for ten minutes, returns the QR code. Nothing is saved on the user yet. */
  async setup(req: Request, auth: AuthContext): Promise<TwoFactorSetupResponse> {
    if (await this.isEnabled(auth.userId))
      throw new ApiException(
        'conflict',
        'Two-step verification is already on. Turn it off first to set it up again.',
      );
    const org = await this.organizations.current();
    const issuer = (
      org?.tradingName ||
      org?.legalName ||
      this.env.APP_NAME ||
      DEFAULT_APP_NAME
    ).replace(/[:;]/g, ' ');
    const secret = newTotpSecret();
    const otpauthUrl = totpUri(secret, issuer, auth.email);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    });
    const sealed = seal(secret, this.key, `totp-setup:${auth.userId}`);
    await this.redis.client.set(
      `totp-setup:${auth.userId}`,
      JSON.stringify(sealed),
      'EX',
      SETUP_TTL_SECONDS,
    );
    await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
      audit({ action: TwoFactorActions.setupStarted, entityType: 'user', entityId: auth.userId }),
    );
    return { otpauthUrl, secret, qrDataUrl, issuer, account: auth.email };
  }

  /** The first code proves the app is set up; then the secret is saved and ten recovery codes are shown once. */
  async confirm(req: Request, auth: AuthContext, code: string): Promise<RecoveryCodesResponse> {
    const raw = await this.redis.client.get(`totp-setup:${auth.userId}`);
    if (!raw) throw new ApiException('token_invalid', 'The set-up expired. Start again.');
    const secret = open(JSON.parse(raw), this.key, `totp-setup:${auth.userId}`).toString('utf8');
    const check = checkTotp(secret, code);
    if (!check.valid)
      throw new ApiException(
        'invalid_code',
        'That code is not right. Check the time on your phone and try again.',
      );
    const codes = newRecoveryCodes();
    const sealed = seal(secret, this.key, `totp:${auth.userId}`);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.userTwoFactor.upsert({
        where: { userId: auth.userId },
        update: {
          secretEncrypted: sealed.value,
          keyFingerprint: sealed.keyFingerprint,
          lastUsedStep: check.step,
          confirmedAt: new Date(),
        },
        create: {
          userId: auth.userId,
          organizationId: auth.organizationId,
          kind: 'totp',
          secretEncrypted: sealed.value,
          keyFingerprint: sealed.keyFingerprint,
          lastUsedStep: check.step,
          confirmedAt: new Date(),
        },
      });
      await this.replaceRecoveryCodes(tx, auth, codes);
      await audit({ action: TwoFactorActions.enabled, entityType: 'user', entityId: auth.userId });
    });
    await this.redis.client.del(`totp-setup:${auth.userId}`);
    await this.queue.sendEmail(auth.organizationId, auth.email, {
      name: 'two-factor-enabled',
      params: {
        appName: this.env.APP_NAME,
        fullName: auth.fullName,
        when: new Date().toUTCString(),
      },
    });
    return { recoveryCodes: codes.map(formatRecoveryCode) };
  }

  private async replaceRecoveryCodes(tx: Tx, auth: AuthContext, codes: string[]): Promise<void> {
    await tx.recoveryCode.deleteMany({ where: { userId: auth.userId } });
    await tx.recoveryCode.createMany({
      data: codes.map((c) => ({
        userId: auth.userId,
        organizationId: auth.organizationId,
        codeHash: hmacCode(c, this.key),
      })),
    });
  }

  /** Step-up protected. */
  async regenerateRecoveryCodes(req: Request, auth: AuthContext): Promise<RecoveryCodesResponse> {
    if (!(await this.isEnabled(auth.userId)))
      throw new ApiException('two_factor_not_set_up', 'Set up two-step verification first');
    const codes = newRecoveryCodes();
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await this.replaceRecoveryCodes(tx, auth, codes);
      await audit({
        action: TwoFactorActions.recoveryCodesRegenerated,
        entityType: 'user',
        entityId: auth.userId,
      });
    });
    return { recoveryCodes: codes.map(formatRecoveryCode) };
  }

  /** Step-up protected. Removes the secret, the codes and every trusted device. */
  async disable(req: Request, res: Response, auth: AuthContext): Promise<void> {
    if (!(await this.isEnabled(auth.userId)))
      throw new ApiException('two_factor_not_set_up', 'Two-step verification is not on');
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await this.removeAll(tx, auth.userId);
      await audit({ action: TwoFactorActions.disabled, entityType: 'user', entityId: auth.userId });
    });
    this.clearTrustedCookie(res);
    await this.queue.sendEmail(auth.organizationId, auth.email, {
      name: 'two-factor-disabled',
      params: {
        appName: this.env.APP_NAME,
        fullName: auth.fullName,
        when: new Date().toUTCString(),
      },
    });
  }

  async removeAll(tx: Tx, userId: string): Promise<void> {
    await tx.userTwoFactor.deleteMany({ where: { userId } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Checks a code against the saved secret and refuses a step already used (replay). */
  async checkCodeForUser(userId: string, code: string): Promise<boolean> {
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId } });
    if (!row?.confirmedAt) return false;
    const secret = open(
      { value: row.secretEncrypted, keyFingerprint: row.keyFingerprint },
      this.key,
      `totp:${userId}`,
    ).toString('utf8');
    const check = checkTotp(secret, code);
    if (!check.valid || check.step == null) return false;
    if (row.lastUsedStep != null && BigInt(check.step) <= row.lastUsedStep) return false;
    await this.prisma.userTwoFactor.update({
      where: { userId },
      data: { lastUsedStep: BigInt(check.step) },
    });
    return true;
  }

  /** The verify screen after sign-in: a code or a recovery code; optionally trust this device. */
  async verifySession(
    req: Request,
    res: Response,
    auth: AuthContext,
    input: TwoFactorVerifyRequest,
  ) {
    if (auth.stage !== 'verify_two_factor')
      throw new ApiException('wrong_stage', 'Nothing to verify');
    const settings = await this.security.read(auth.organizationId);
    let usedRecovery = false;
    let ok = false;
    if (input.code) {
      ok = await this.checkCodeForUser(auth.userId, input.code);
    } else if (input.recoveryCode) {
      const hash = hmacCode(input.recoveryCode, this.key);
      const claimed = await this.prisma.recoveryCode.updateMany({
        where: { userId: auth.userId, codeHash: hash, usedAt: null },
        data: { usedAt: new Date() },
      });
      ok = claimed.count === 1;
      usedRecovery = ok;
    }
    if (!ok) {
      const failures = await this.countFailure(auth.sessionId);
      await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
        audit({
          action: TwoFactorActions.verifyFailed,
          entityType: 'session',
          entityId: auth.sessionId,
          changes: { failures, recovery: !!input.recoveryCode },
        }),
      );
      if (failures >= 5) {
        await this.sessions.revoke(auth.sessionId, 'two_factor_failures');
        this.sessions.clearCookie(res);
        throw new ApiException('unauthenticated', 'Too many wrong codes. Sign in again.');
      }
      throw new ApiException(
        'invalid_code',
        input.recoveryCode
          ? 'That recovery code is not right or was already used'
          : 'That code is not right. Check the time on your phone and try again.',
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { mustChangePassword: true },
    });
    const stage = user.mustChangePassword ? 'change_password' : 'active';
    const left = await this.prisma.recoveryCode.count({
      where: { userId: auth.userId, usedAt: null },
    });
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await this.sessions.setStage(tx, auth.sessionId, stage);
      await audit({
        action: usedRecovery ? TwoFactorActions.recoveryCodeUsed : TwoFactorActions.verified,
        entityType: 'session',
        entityId: auth.sessionId,
        changes: usedRecovery ? { recoveryCodesLeft: left } : undefined,
      });
      if (usedRecovery) {
        await this.notifications.notify(tx, {
          organizationId: auth.organizationId,
          userId: auth.userId,
          type: 'security.recovery_code_used',
          title: 'A recovery code was used to sign in',
          body: `${left} recovery code${left === 1 ? '' : 's'} left. Make new ones if this was not you.`,
          link: '/profile?tab=security',
        });
      }
      if (input.trustDevice && settings.twoFactor.trustedDeviceDays > 0) {
        const token = newToken(32);
        const expiresAt = new Date(Date.now() + settings.twoFactor.trustedDeviceDays * 86_400_000);
        const device = await tx.trustedDevice.create({
          data: {
            organizationId: auth.organizationId,
            userId: auth.userId,
            tokenHash: hashToken(token),
            label: deviceLabel(userAgentOf(req)),
            expiresAt,
            lastUsedAt: new Date(),
          },
        });
        res.cookie(this.trustedCookieName, token, {
          httpOnly: true,
          secure: this.env.COOKIE_SECURE,
          sameSite: 'lax',
          path: '/',
          maxAge: settings.twoFactor.trustedDeviceDays * 86_400_000,
        });
        await audit({
          action: TwoFactorActions.trustedDeviceAdded,
          entityType: 'trusted_device',
          entityId: device.id,
          changes: { expiresAt },
        });
      }
    });
    if (usedRecovery) {
      await this.queue.sendEmail(auth.organizationId, auth.email, {
        name: 'recovery-code-used',
        params: {
          appName: this.env.APP_NAME,
          fullName: auth.fullName,
          when: new Date().toUTCString(),
          left,
        },
      });
    }
    const setupComplete = await this.organizations.isSetupComplete(auth.organizationId);
    return {
      next: nextFor(stage, setupComplete) as '/setup' | '/change-password' | '/dashboard',
      recoveryCodesLeft: usedRecovery ? left : undefined,
    };
  }

  private readonly failures = new Map<string, number>();
  private async countFailure(sessionId: string): Promise<number> {
    const n = (this.failures.get(sessionId) ?? 0) + 1;
    this.failures.set(sessionId, n);
    setTimeout(() => this.failures.delete(sessionId), 15 * 60_000).unref();
    return n;
  }

  trustedTokenFrom(req: Request): string | undefined {
    return trustedTokenFrom(req, this.env);
  }

  clearTrustedCookie(res: Response): void {
    res.clearCookie(this.trustedCookieName, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    });
  }

  /** At sign-in: is this browser a trusted device for the user? Touches lastUsedAt. */
  async isTrustedDevice(req: Request, userId: string): Promise<boolean> {
    const token = this.trustedTokenFrom(req);
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

  async revokeTrustedDevice(
    req: Request,
    res: Response,
    auth: AuthContext,
    id: string,
  ): Promise<void> {
    const row = await this.prisma.trustedDevice.findFirst({
      where: { id, userId: auth.userId, revokedAt: null },
    });
    if (!row) throw notFound('Device not found');
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.trustedDevice.update({ where: { id }, data: { revokedAt: new Date() } });
      await audit({
        action: TwoFactorActions.trustedDeviceRevoked,
        entityType: 'trusted_device',
        entityId: id,
      });
    });
    const current = this.trustedTokenFrom(req);
    if (current && hashToken(current) === row.tokenHash) this.clearTrustedCookie(res);
  }

  async dismissReminder(req: Request, auth: AuthContext): Promise<void> {
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.userPreferences.upsert({
        where: { userId: auth.userId },
        update: { twoFactorReminderDismissedAt: new Date() },
        create: {
          userId: auth.userId,
          organizationId: auth.organizationId,
          twoFactorReminderDismissedAt: new Date(),
        },
      });
      await audit({
        action: TwoFactorActions.reminderDismissed,
        entityType: 'user',
        entityId: auth.userId,
      });
    });
  }

  /** Administrator: lost phone. Step-up protected and audited; the person is emailed. */
  async adminReset(req: Request, auth: AuthContext, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: auth.organizationId },
    });
    if (!user) throw notFound('User not found');
    if (!(await this.isEnabled(userId)))
      throw new ApiException(
        'two_factor_not_set_up',
        'This person has no two-step verification to reset',
      );
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await this.removeAll(tx, userId);
      await this.sessions.revokeAllForUser(tx, userId, 'two_factor_reset_by_admin');
      await audit({ action: TwoFactorActions.adminReset, entityType: 'user', entityId: userId });
      await this.notifications.notify(tx, {
        organizationId: auth.organizationId,
        userId,
        type: 'security.two_factor_reset',
        title: 'Two-step verification was reset by an administrator',
        link: '/profile?tab=security',
      });
    });
    await this.queue.sendEmail(auth.organizationId, user.email, {
      name: 'two-factor-reset-by-admin',
      params: {
        appName: this.env.APP_NAME,
        fullName: user.fullName,
        when: new Date().toUTCString(),
      },
    });
  }

  /** Administrator: send the reminder email now. */
  async sendReminderNow(req: Request, auth: AuthContext, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: auth.organizationId, status: 'active' },
    });
    if (!user) throw notFound('User not found');
    if (await this.isEnabled(userId))
      throw new ApiException('conflict', 'This person already has two-step verification on');
    const day = Math.max(1, Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000));
    await this.queue.sendEmail(auth.organizationId, user.email, {
      name: 'two-factor-reminder',
      params: {
        appName: this.env.APP_NAME,
        fullName: user.fullName,
        link: `${this.env.WEB_ORIGIN}/profile?tab=security`,
        day,
      },
    });
    await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
      audit({
        action: TwoFactorActions.reminderSent,
        entityType: 'user',
        entityId: userId,
        changes: { by: 'admin' },
      }),
    );
  }
}
