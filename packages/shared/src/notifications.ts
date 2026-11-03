import { z } from 'zod';

/** Every notification kind, with its defaults; per-user preferences override. */
export interface NotificationType {
  key: string;
  label: string;
  description: string;
  defaultInApp: boolean;
  defaultEmail: boolean;
  /** Who may receive it: everyone, or administrators (notifications.manage or Super Admin) */
  audience: 'user' | 'admin';
}

export const notificationTypes: readonly NotificationType[] = [
  {
    key: 'security.recovery_code_used',
    label: 'A recovery code was used',
    description: 'Someone signed in to your account with a recovery code.',
    defaultInApp: true,
    defaultEmail: true,
    audience: 'user',
  },
  {
    key: 'security.two_factor_reset',
    label: 'Two-step verification was reset',
    description: 'An administrator removed two-step verification from your account.',
    defaultInApp: true,
    defaultEmail: true,
    audience: 'user',
  },
  {
    key: 'security.new_device',
    label: 'New device sign-in',
    description: 'Your account was used from a device not seen before.',
    defaultInApp: true,
    defaultEmail: true,
    audience: 'user',
  },
  {
    key: 'users.superadmin_changed',
    label: 'Super Admin changed',
    description: 'You were made, or are no longer, a Super Admin.',
    defaultInApp: true,
    defaultEmail: false,
    audience: 'user',
  },
  {
    key: 'users.invitation_accepted',
    label: 'Invitation accepted',
    description: 'Someone you invited accepted and can sign in.',
    defaultInApp: true,
    defaultEmail: false,
    audience: 'user',
  },
  {
    key: 'admin.security_lockout',
    label: 'Account locked out',
    description: 'An account was locked after too many wrong passwords.',
    defaultInApp: true,
    defaultEmail: true,
    audience: 'admin',
  },
  {
    key: 'admin.security_settings_changed',
    label: 'Security settings changed',
    description: 'Someone saved Settings → Security.',
    defaultInApp: true,
    defaultEmail: true,
    audience: 'admin',
  },
  {
    key: 'admin.backup_failed',
    label: 'Backup failed',
    description: 'A backup did not complete.',
    defaultInApp: true,
    defaultEmail: true,
    audience: 'admin',
  },
  {
    key: 'admin.backup_missed',
    label: 'Backup missed',
    description: 'No successful backup in the last day.',
    defaultInApp: true,
    defaultEmail: true,
    audience: 'admin',
  },
  {
    key: 'admin.drill_failed',
    label: 'Restore drill failed',
    description: 'The weekly restore drill did not pass.',
    defaultInApp: true,
    defaultEmail: true,
    audience: 'admin',
  },
  {
    key: 'admin.maintenance_changed',
    label: 'Maintenance mode changed',
    description: 'The app was closed or reopened.',
    defaultInApp: true,
    defaultEmail: false,
    audience: 'admin',
  },
];

export const notificationTypeKeys = notificationTypes.map((t) => t.key);

export const notificationSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  notifications: z.array(notificationSchema),
  unread: z.number().int(),
  nextCursor: z.string().nullable(),
});

export const notificationPreferenceSchema = z.object({
  type: z.string(),
  label: z.string(),
  description: z.string(),
  inApp: z.boolean(),
  email: z.boolean(),
});
export const notificationPreferencesSchema = z.object({
  preferences: z.array(notificationPreferenceSchema),
});
export const updateNotificationPreferencesSchema = z.object({
  preferences: z
    .array(z.object({ type: z.string(), inApp: z.boolean(), email: z.boolean() }))
    .max(50),
});
