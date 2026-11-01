import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { notificationTypes, type AdminEventKey } from '@inspower/shared';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { PrismaService, type Tx } from '../../platform/database/prisma.service';
import { QueueService } from '../../platform/jobs/queue.service';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { SettingsReader } from '../settings/settings-reader';
import { notifyAdministrators } from '../backups/admin-notify';

interface NotifyInput {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/**
 * In-app notifications, written in the same transaction as the change, pushed live through the
 * outbox. Per-user preferences decide in-app and email per type, with the registry's defaults.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly queue: QueueService,
    private readonly settings: SettingsReader,
  ) {}

  private async preference(
    tx: Tx,
    userId: string,
    type: string,
  ): Promise<{ inApp: boolean; email: boolean }> {
    const def = notificationTypes.find((t) => t.key === type);
    const row = await tx.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });
    return {
      inApp: row?.inApp ?? def?.defaultInApp ?? true,
      email: row?.email ?? def?.defaultEmail ?? false,
    };
  }

  async notify(tx: Tx, input: NotifyInput): Promise<void> {
    const pref = await this.preference(tx, input.userId, input.type);
    if (!pref.inApp) return;
    const row = await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });
    await tx.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        name: 'notifications.notification.created',
        channels: [`user:${input.userId}`],
        payload: { id: row.id },
      },
    });
  }

  /** Administrators: everyone with notifications.manage or the Super Admin; email per Settings -> Notifications. */
  notifyAdmins(
    tx: Tx,
    organizationId: string,
    input: Omit<NotifyInput, 'organizationId' | 'userId'> & { adminEvent: AdminEventKey },
  ): Promise<void> {
    return notifyAdministrators(
      tx,
      { env: this.env, emailQueue: this.queue.queue('email') },
      organizationId,
      input,
    );
  }

  async list(auth: AuthContext, cursor: string | undefined, unreadOnly: boolean) {
    const take = 30;
    const rows = await this.prisma.notification.findMany({
      where: {
        userId: auth.userId,
        ...(unreadOnly ? { readAt: null } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: take + 1,
    });
    const unread = await this.prisma.notification.count({
      where: { userId: auth.userId, readAt: null },
    });
    const page = rows.slice(0, take);
    return {
      notifications: page.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unread,
      nextCursor: rows.length > take ? page.at(-1)!.id : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(auth: AuthContext, ids: string[] | 'all'): Promise<{ unread: number }> {
    await this.prisma.notification.updateMany({
      where: { userId: auth.userId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
    return { unread: await this.unreadCount(auth.userId) };
  }

  async preferences(auth: AuthContext) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId: auth.userId },
    });
    const byType = new Map(rows.map((r) => [r.type, r]));
    const isAdmin = auth.isSuperAdmin || auth.permissions.has('notifications.manage');
    return {
      preferences: notificationTypes
        .filter((t) => t.audience === 'user' || isAdmin)
        .map((t) => ({
          type: t.key,
          label: t.label,
          description: t.description,
          inApp: byType.get(t.key)?.inApp ?? t.defaultInApp,
          email: byType.get(t.key)?.email ?? t.defaultEmail,
        })),
    };
  }

  async updatePreferences(
    req: Request,
    auth: AuthContext,
    input: { type: string; inApp: boolean; email: boolean }[],
  ) {
    const known = new Set(notificationTypes.map((t) => t.key));
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      for (const p of input) {
        if (!known.has(p.type)) continue;
        await tx.notificationPreference.upsert({
          where: { userId_type: { userId: auth.userId, type: p.type } },
          update: { inApp: p.inApp, email: p.email },
          create: {
            userId: auth.userId,
            organizationId: auth.organizationId,
            type: p.type,
            inApp: p.inApp,
            email: p.email,
          },
        });
      }
      await audit({
        action: 'profile.notifications.updated',
        entityType: 'notification_preferences',
        entityId: auth.userId,
        changes: { after: input },
      });
    });
    return this.preferences(auth);
  }
}
