import { z } from 'zod';

/** Contracts for two-step verification, trusted devices, step-up and the reminder. */

export const totpCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'));

export const recoveryCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]+/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z2-9]{10}$/, 'Enter a 10-character recovery code'));

export const trustedDeviceSchema = z.object({
  id: z.string().uuid(),
  label: z.string().nullable(),
  current: z.boolean(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
});
export type TrustedDevice = z.infer<typeof trustedDeviceSchema>;

export const twoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  confirmedAt: z.string().datetime().nullable(),
  recoveryCodesLeft: z.number().int().min(0),
  trustedDevices: z.array(trustedDeviceSchema),
  trustedDeviceDays: z.number().int().min(0).max(90),
  reminder: z.object({
    show: z.boolean(),
    intervalDays: z.number().int(),
  }),
});
export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

export const twoFactorSetupResponseSchema = z.object({
  otpauthUrl: z.string().url(),
  /** The base32 key, for same-device set-up where a QR code cannot be scanned. */
  secret: z.string(),
  qrDataUrl: z.string().startsWith('data:image/png;base64,'),
  issuer: z.string(),
  account: z.string(),
});
export type TwoFactorSetupResponse = z.infer<typeof twoFactorSetupResponseSchema>;

export const twoFactorConfirmRequestSchema = z.object({ code: totpCodeSchema });
export const recoveryCodesResponseSchema = z.object({
  recoveryCodes: z.array(z.string()).length(10),
});
export type RecoveryCodesResponse = z.infer<typeof recoveryCodesResponseSchema>;

/** The verify screen: a code from the app, or a recovery code; optionally trust this device. */
export const twoFactorVerifyRequestSchema = z
  .object({
    code: totpCodeSchema.optional(),
    recoveryCode: recoveryCodeSchema.optional(),
    trustDevice: z.boolean().default(false),
  })
  .refine((v) => (v.code ? 1 : 0) + (v.recoveryCode ? 1 : 0) === 1, {
    message: 'Enter a code or a recovery code',
  });
export type TwoFactorVerifyRequest = z.infer<typeof twoFactorVerifyRequestSchema>;

export const twoFactorVerifyResponseSchema = z.object({
  next: z.enum(['/setup', '/change-password', '/dashboard']),
  recoveryCodesLeft: z.number().int().optional(),
});

/** Step-up: prove it is still you before a sensitive action. */
export const stepUpRequestSchema = z
  .object({
    password: z.string().min(1).max(128).optional(),
    code: totpCodeSchema.optional(),
  })
  .refine((v) => (v.password ? 1 : 0) + (v.code ? 1 : 0) === 1, {
    message: 'Enter your password or a code',
  });
export type StepUpRequest = z.infer<typeof stepUpRequestSchema>;

export const stepUpStatusSchema = z.object({
  active: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  methods: z.array(z.enum(['password', 'totp'])),
});
export type StepUpStatus = z.infer<typeof stepUpStatusSchema>;

/** Users list (first version; Phase 3 adds invite, roles, disable and anonymise). */
export const userListItemSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  status: z.enum(['invited', 'active', 'disabled', 'anonymised']),
  roles: z.array(z.string()),
  twoFactorEnabled: z.boolean(),
  lastSignInAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type UserListItem = z.infer<typeof userListItemSchema>;
export const userListSchema = z.object({
  users: z.array(userListItemSchema),
  total: z.number().int(),
});
export const userListQuerySchema = z.object({
  twoFactor: z.enum(['all', 'on', 'off']).default('all'),
  q: z.string().trim().max(100).optional(),
});
