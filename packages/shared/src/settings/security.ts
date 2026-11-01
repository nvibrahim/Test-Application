import { z } from 'zod';
import { passwordRulesSchema } from '../password-policy.js';

/**
 * Settings -> Security. Stored per section in `app_settings`; the API reads it through one
 * reader with these defaults until Phase 4 adds the screen. Every duration is in minutes.
 */
export const securitySettingsSchema = z.object({
  version: z.literal(1).default(1),
  session: z
    .object({
      idleMinutes: z
        .number()
        .int()
        .min(5)
        .max(24 * 60)
        .default(30),
      warningMinutes: z.number().int().min(1).max(30).default(2),
      absoluteHours: z
        .number()
        .int()
        .min(1)
        .max(24 * 30)
        .default(12),
      rememberMeDays: z.number().int().min(1).max(90).default(30),
    })
    .prefault({}),
  lockout: z
    .object({
      /** Growing delays start after this many wrong passwords */
      delayAfterAttempts: z.number().int().min(1).max(20).default(5),
      /** The account locks after this many wrong passwords in the window */
      lockAfterAttempts: z.number().int().min(2).max(50).default(10),
      windowMinutes: z
        .number()
        .int()
        .min(5)
        .max(24 * 60)
        .default(15),
      lockMinutes: z
        .number()
        .int()
        .min(1)
        .max(24 * 60)
        .default(15),
      /** Sign-in attempts from one address in the window before it is blocked */
      perIpAttempts: z.number().int().min(10).max(1000).default(100),
      perIpBlockMinutes: z
        .number()
        .int()
        .min(1)
        .max(24 * 60)
        .default(15),
      /** Password reset requests per email and per address in an hour */
      resetRequestsPerHour: z.number().int().min(1).max(100).default(5),
    })
    .prefault({}),
  password: passwordRulesSchema.prefault({}),
  twoFactor: z
    .object({
      /** 1.0 fixes the policy at optional; enforcing modes are reserved */
      policy: z.enum(['optional', 'required_admins', 'required_all']).default('optional'),
      reminderIntervalDays: z.number().int().min(1).max(90).default(7),
      reminderEmails: z.boolean().default(true),
      trustedDeviceDays: z.number().int().min(0).max(90).default(30),
    })
    .prefault({}),
  stepUpMinutes: z.number().int().min(1).max(60).default(10),
  adminIpAllowlist: z.array(z.string()).default([]),
});
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;
export const defaultSecuritySettings: SecuritySettings = securitySettingsSchema.parse({});

export const SETTINGS_SECTION_SECURITY = 'security';
