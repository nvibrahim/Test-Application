import { z } from 'zod';
import { securitySettingsSchema } from './security.js';

/**
 * Every settings section has its own Zod schema and is saved independently. Values live as
 * key/value rows in `app_settings` (one row per top-level key, `is_secret` for sealed values);
 * the schema supplies defaults, so a section that was never saved still reads completely.
 */
export const generalSettingsSchema = z.object({
  version: z.literal(1).default(1),
  appName: z.string().trim().min(1).max(60).default('Inspower'),
  tagline: z.string().trim().max(160).default('The foundation platform for your organization.'),
  supportEmail: z.string().trim().email().max(254).nullable().default(null),
  landing: z
    .object({
      headline: z
        .string()
        .trim()
        .max(120)
        .default('Everything your organization runs on, in one place.'),
      intro: z
        .string()
        .trim()
        .max(600)
        .default(
          'People, settings and records, protected by your password and two-step verification. Sign in to get started.',
        ),
      showContactForm: z.boolean().default(true),
    })
    .prefault({}),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

export const colorHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A colour like #1D4ED8');

export const appearanceSettingsSchema = z.object({
  version: z.literal(1).default(1),
  /** null = the built-in look */
  brandColor: colorHex.nullable().default(null),
  sidebarStyle: z.enum(['light', 'dark', 'brand']).default('light'),
  topBarStyle: z.enum(['plain', 'brand']).default('plain'),
  signInPanel: z.enum(['brand', 'image']).default('brand'),
  defaultTheme: z.enum(['light', 'dark', 'system']).default('system'),
  defaultDensity: z.enum(['comfortable', 'compact']).default('comfortable'),
  cornerRadius: z.enum(['small', 'medium', 'large']).default('medium'),
});
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;

export const localizationSettingsSchema = z.object({
  version: z.literal(1).default(1),
  language: z.enum(['en']).default('en'),
  dateFormat: z
    .enum(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'd MMM yyyy'])
    .default('dd/MM/yyyy'),
  timeFormat: z.enum(['24h', '12h']).default('24h'),
  numberLocale: z.string().trim().min(2).max(12).default('en-GB'),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]).default(1),
});
export type LocalizationSettings = z.infer<typeof localizationSettingsSchema>;

/** SMTP. The password is sealed at rest and never returned; the API tells the screen whether it is set. */
export const emailSettingsSchema = z.object({
  version: z.literal(1).default(1),
  /** null = use the environment (Mailpit locally) */
  host: z.string().trim().max(253).nullable().default(null),
  port: z.number().int().min(1).max(65535).default(587),
  security: z.enum(['starttls', 'tls', 'none']).default('starttls'),
  user: z.string().trim().max(254).nullable().default(null),
  fromName: z.string().trim().max(100).default('Inspower'),
  fromAddress: z.string().trim().email().max(254).nullable().default(null),
  replyTo: z.string().trim().email().max(254).nullable().default(null),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;
/** Written with the section, stored sealed, never read back by the screen. */
export const emailSecretKeys = ['password'] as const;

export const emailProviderPresets = [
  {
    key: 'gmail',
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    security: 'starttls',
    note: 'Needs an app password (Google Account → Security → 2-Step Verification → App passwords).',
  },
  {
    key: 'outlook',
    label: 'Outlook.com / Hotmail / Live',
    host: 'smtp-mail.outlook.com',
    port: 587,
    security: 'starttls',
    note: 'An app password if 2-step verification is on.',
  },
  {
    key: 'microsoft365',
    label: 'Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    security: 'starttls',
    note: 'Some tenants disable SMTP AUTH; ask the Microsoft 365 admin to enable it for the mailbox.',
  },
  {
    key: 'yahoo',
    label: 'Yahoo Mail',
    host: 'smtp.mail.yahoo.com',
    port: 587,
    security: 'starttls',
    note: 'Needs an app password.',
  },
] as const;

/** Which administrator events send an email (in-app notifications are always written). */
export const adminEventKeys = [
  'security.lockout',
  'security.new_device',
  'security.settings_changed',
  'security.two_factor_reset',
  'users.invitation_accepted',
  'backups.failed',
  'backups.missed',
  'backups.drill_failed',
  'system.maintenance_changed',
] as const;
export type AdminEventKey = (typeof adminEventKeys)[number];

export const notificationSettingsSchema = z.object({
  version: z.literal(1).default(1),
  emailAdminsOn: z
    .array(z.enum(adminEventKeys))
    .default([
      'security.lockout',
      'security.settings_changed',
      'backups.failed',
      'backups.missed',
      'backups.drill_failed',
    ]),
  /** Extra addresses for administrator emails, beside every administrator's own */
  extraRecipients: z.array(z.string().trim().email()).max(10).default([]),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const backupSettingsSchema = z.object({
  version: z.literal(1).default(1),
  nightlyAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('02:00'),
  retention: z
    .object({
      daily: z.number().int().min(1).max(90).default(14),
      weekly: z.number().int().min(0).max(52).default(8),
      monthly: z.number().int().min(0).max(60).default(12),
    })
    .prefault({}),
  /** The off-site target id (backup_targets) or null for local only */
  offsiteTargetId: z.string().uuid().nullable().default(null),
  restoreDrill: z.enum(['off', 'weekly']).default('weekly'),
  /** A Healthchecks-style URL pinged after each successful nightly backup */
  pingUrl: z.string().url().nullable().default(null),
});
export type BackupSettings = z.infer<typeof backupSettingsSchema>;

export const maintenanceSettingsSchema = z.object({
  version: z.literal(1).default(1),
  enabled: z.boolean().default(false),
  message: z
    .string()
    .trim()
    .max(500)
    .default('We are doing some maintenance. Please try again in a few minutes.'),
  /** Role keys that may keep using the app */
  allowedRoleKeys: z.array(z.string()).default(['super_admin', 'administrator']),
});
export type MaintenanceSettings = z.infer<typeof maintenanceSettingsSchema>;

export const settingsSections = {
  general: generalSettingsSchema,
  appearance: appearanceSettingsSchema,
  localization: localizationSettingsSchema,
  security: securitySettingsSchema,
  email: emailSettingsSchema,
  notifications: notificationSettingsSchema,
  backups: backupSettingsSchema,
  maintenance: maintenanceSettingsSchema,
} as const;
export type SettingsSectionKey = keyof typeof settingsSections;
export const settingsSectionKeys = Object.keys(settingsSections) as SettingsSectionKey[];

/** Which permission edits a section, and whether saving asks for step-up. */
export const settingsSectionRules: Record<
  SettingsSectionKey,
  { permission: string; stepUp: boolean; label: string; description: string }
> = {
  general: {
    permission: 'settings.manage',
    stepUp: false,
    label: 'General',
    description: 'Application name, tagline, support email and the landing page wording.',
  },
  appearance: {
    permission: 'settings.manage',
    stepUp: false,
    label: 'Appearance',
    description: 'Brand colour, logo, sidebar and sign-in look. Each site’s own.',
  },
  localization: {
    permission: 'settings.manage',
    stepUp: false,
    label: 'Localization',
    description: 'Language, date and number formats.',
  },
  security: {
    permission: 'settings.security.manage',
    stepUp: true,
    label: 'Security',
    description: 'Session timeouts, password rules, lockout, two-step policy.',
  },
  email: {
    permission: 'settings.manage',
    stepUp: true,
    label: 'Email',
    description: 'The mail server the app sends from.',
  },
  notifications: {
    permission: 'settings.manage',
    stepUp: false,
    label: 'Notifications',
    description: 'Which administrator events send an email.',
  },
  backups: {
    permission: 'settings.manage',
    stepUp: true,
    label: 'Backups',
    description: 'Schedule, retention, off-site target and the restore drill.',
  },
  maintenance: {
    permission: 'settings.manage',
    stepUp: true,
    label: 'Maintenance',
    description: 'Close the app to everyone except chosen roles, with a message.',
  },
};

/** Secret keys per section: written sealed, read back as set / not set. */
export const settingsSecretKeys: Partial<Record<SettingsSectionKey, readonly string[]>> = {
  email: emailSecretKeys,
};

/** What the browser may know before signing in. */
export const publicSettingsSchema = z.object({
  appName: z.string(),
  tagline: z.string(),
  supportEmail: z.string().nullable(),
  landing: generalSettingsSchema.shape.landing,
  appearance: appearanceSettingsSchema,
  maintenance: z.object({ enabled: z.boolean(), message: z.string() }),
  organizationName: z.string().nullable(),
  version: z.string(),
});
export type PublicSettings = z.infer<typeof publicSettingsSchema>;

/** Settings -> <section>: the value plus which secrets are set and the version for optimistic locking. */
export const settingsSectionResponseSchema = z.object({
  section: z.string(),
  value: z.record(z.string(), z.unknown()),
  secretsSet: z.array(z.string()),
  updatedAt: z.string().datetime().nullable(),
  updatedByName: z.string().nullable(),
});
export type SettingsSectionResponse = z.infer<typeof settingsSectionResponseSchema>;
