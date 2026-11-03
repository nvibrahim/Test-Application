import type { Queue } from 'bullmq';
import {
  notificationSettingsSchema,
  notificationTypes,
  SUPER_ADMIN_ROLE_KEY,
  type AdminEventKey,
} from '@inspower/shared';
import type { Env } from '../../platform/config/config';
import type { Tx } from '../../platform/database/prisma.service';
import { enqueueEmail } from '../../platform/jobs/email-queue';

export interface AdminNotice {
  type: string;
  title: string;
  body?: string;
  link?: string;
  adminEvent: AdminEventKey;
}

/**
 * Tells every administrator (notifications.manage or Super Admin): an in-app notification each,
 * plus an email when Settings -> Notifications lists the event. A plain function so the worker
 * and the CLI can use it without the Nest container; NotificationsService delegates here.
 */
export async function notifyAdministrators(
  tx: Tx,
  deps: { env: Env; emailQueue: Queue },
  organizationId: string,
  input: AdminNotice,
): Promise<void> {
  const admins = await tx.user.findMany({
    where: {
      organizationId,
      status: 'active',
      roles: {
        some: {
          role: {
            OR: [
              { key: SUPER_ADMIN_ROLE_KEY },
              { permissions: { some: { permissionKey: 'notifications.manage' } } },
            ],
          },
        },
      },
    },
    select: { id: true, email: true },
  });
  const def = notificationTypes.find((t) => t.key === input.type);
  for (const a of admins) {
    const pref = await tx.notificationPreference.findUnique({
      where: { userId_type: { userId: a.id, type: input.type } },
    });
    if (!(pref?.inApp ?? def?.defaultInApp ?? true)) continue;
    const row = await tx.notification.create({
      data: {
        organizationId,
        userId: a.id,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });
    await tx.outboxEvent.create({
      data: {
        organizationId,
        name: 'notifications.notification.created',
        channels: [`user:${a.id}`],
        payload: { id: row.id },
      },
    });
  }
  const rows = await tx.appSetting.findMany({
    where: { organizationId, section: 'notifications' },
    select: { key: true, value: true },
  });
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  const parsed = notificationSettingsSchema.safeParse(raw);
  const settings = parsed.success ? parsed.data : notificationSettingsSchema.parse({});
  if (!settings.emailAdminsOn.includes(input.adminEvent)) return;
  const recipients = new Set<string>([...admins.map((a) => a.email), ...settings.extraRecipients]);
  for (const to of recipients) {
    await enqueueEmail(tx, deps.emailQueue, organizationId, to, {
      name: 'admin-event',
      params: {
        appName: deps.env.APP_NAME,
        title: input.title,
        body: input.body ?? '',
        link: input.link ? `${deps.env.WEB_ORIGIN}${input.link}` : deps.env.WEB_ORIGIN,
      },
    });
  }
}
