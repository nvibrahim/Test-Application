import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { hashToken, newToken } from '../../platform/crypto/crypto';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException } from '../../platform/http/api-error';
import { QueueService } from '../../platform/jobs/queue.service';
import { renderEmail } from '../../platform/mail/templates';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { clientIp, userAgentOf } from '../access/request-context';
import { OrganizationService } from '../organization/organization.service';
import { AuthActions } from './auth.actions';
import { PasswordsService } from './passwords.service';
import { SecuritySettingsService } from './security-settings';
import { SessionsService } from './sessions.service';
import { ThrottleService } from './throttle.service';

export const RESET_LINK_MINUTES = 30;

@Injectable()
export class RecoveryService {
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
  ) {}

  /** Always answers the same way; only an active account gets an email. */
  async requestReset(req: Request, email: string): Promise<void> {
    const organizationId = await this.organizations.currentId();
    if (!organizationId) return;
    const settings = await this.security.read(organizationId);
    const ip = clientIp(req);
    await this.throttle.checkResetRequest(email, ip, settings);

    const user = await this.prisma.user.findUnique({
      where: { organizationId_emailNormalized: { organizationId, emailNormalized: email } },
    });
    if (!user || user.status !== 'active') return;

    const token = newToken(32);
    const expiresAt = new Date(Date.now() + RESET_LINK_MINUTES * 60_000);
    await this.transactions.run(
      { organizationId, actorId: null, ip, userAgent: userAgentOf(req) },
      async ({ tx, audit }) => {
        await tx.passwordResetToken.create({
          data: {
            organizationId,
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt,
            requestIp: ip,
          },
        });
        await audit({
          action: AuthActions.passwordResetRequested,
          entityType: 'user',
          entityId: user.id,
        });
      },
    );
    const link = `${this.env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    const template = {
      name: 'password-reset' as const,
      params: {
        appName: this.env.APP_NAME,
        fullName: user.fullName,
        link,
        minutes: RESET_LINK_MINUTES,
      },
    };
    await this.queue.sendEmail(organizationId, user.email, template, renderEmail(template).subject);
  }

  /** Single use, 30 minutes; every session is signed out and the lock is cleared. */
  async reset(req: Request, token: string, newPassword: string): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.status !== 'active') {
      throw new ApiException(
        'token_invalid',
        'This link is not valid any more. Ask for a new one.',
      );
    }
    const settings = await this.security.read(row.organizationId);
    const org = await this.organizations.current();
    const isSuperAdmin = await this.prisma.userRole
      .count({ where: { userId: row.userId, role: { key: 'super_admin' } } })
      .then((n) => n > 0);
    const evaluation = await this.passwords.evaluateForUser(
      newPassword,
      settings.password,
      {
        email: row.user.email,
        fullName: row.user.fullName,
        organizationName: org?.legalName,
        appName: this.env.APP_NAME,
        isSuperAdmin,
      },
      row.userId,
    );
    if (!evaluation.ok)
      throw new ApiException('password_rejected', 'Choose a stronger password', {
        problems: this.passwords.describe(evaluation),
      });

    const hash = await this.passwords.hash(newPassword);
    await this.transactions.run(
      {
        organizationId: row.organizationId,
        actorId: row.userId,
        ip: clientIp(req),
        userAgent: userAgentOf(req),
      },
      async ({ tx, audit }) => {
        const claimed = await tx.passwordResetToken.updateMany({
          where: { id: row.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new ApiException('token_invalid', 'This link was already used.');
        await this.passwords.setPassword(
          tx,
          row.userId,
          row.organizationId,
          hash,
          settings.password.historyCount,
        );
        const revoked = await this.sessions.revokeAllForUser(tx, row.userId, 'password_reset');
        await audit({
          action: AuthActions.passwordReset,
          entityType: 'user',
          entityId: row.userId,
          changes: { sessionsRevoked: revoked },
        });
      },
    );
    await this.throttle.clearFailures(row.user.emailNormalized);
    const template = {
      name: 'password-changed' as const,
      params: {
        appName: this.env.APP_NAME,
        fullName: row.user.fullName,
        when: new Date().toUTCString(),
      },
    };
    await this.queue.sendEmail(
      row.organizationId,
      row.user.email,
      template,
      renderEmail(template).subject,
    );
  }
}
