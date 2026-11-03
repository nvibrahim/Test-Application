import { SETTINGS_SECTION_SECURITY, securitySettingsSchema } from '@inspower/shared';
import { enqueueEmail } from '../../platform/jobs/email-queue';
import type { MaintenanceTask } from './index';

export const REMINDER_DAYS = [1, 7, 30] as const;

/** Day 1, 7 and 30 after the account was created, once each, to active people without two-step verification. */
export const twoFactorReminder: MaintenanceTask = async ({
  prisma,
  emailQueue,
  env,
  organizationId,
  now,
}) => {
  const rows = await prisma.appSetting.findMany({
    where: { organizationId, section: SETTINGS_SECTION_SECURITY },
  });
  const raw: Record<string, unknown> = {};
  for (const row of rows) raw[row.key] = row.value;
  const parsed = securitySettingsSchema.safeParse(raw);
  const settings = parsed.success ? parsed.data : securitySettingsSchema.parse({});
  if (!settings.twoFactor.reminderEmails) return 'Reminder emails are switched off';

  const users = await prisma.user.findMany({
    where: {
      organizationId,
      status: 'active',
      OR: [{ twoFactor: null }, { twoFactor: { confirmedAt: null } }],
    },
    include: { preferences: { select: { twoFactorRemindersSent: true } } },
  });
  let sent = 0;
  for (const user of users) {
    const ageDays = Math.floor((now.getTime() - user.createdAt.getTime()) / 86_400_000);
    const already = user.preferences?.twoFactorRemindersSent ?? [];
    const due = REMINDER_DAYS.filter((d) => ageDays >= d && !already.includes(d));
    const day = due.at(-1);
    if (day === undefined) continue;
    await enqueueEmail(prisma, emailQueue, organizationId, user.email, {
      name: 'two-factor-reminder',
      params: {
        appName: env.APP_NAME,
        fullName: user.fullName,
        link: `${env.WEB_ORIGIN}/profile?tab=security`,
        day,
      },
    });
    await prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: { twoFactorRemindersSent: [...already, ...due] },
      create: { userId: user.id, organizationId, twoFactorRemindersSent: [...due] },
    });
    await prisma.auditLog.create({
      data: {
        organizationId,
        action: 'auth.two_factor.reminder_sent',
        entityType: 'user',
        entityId: user.id,
        changes: { day, by: 'scheduler' },
      },
    });
    sent += 1;
  }
  return `Sent ${sent} reminder${sent === 1 ? '' : 's'} to ${users.length} people without two-step verification`;
};
