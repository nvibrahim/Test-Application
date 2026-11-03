import { z } from 'zod';

/** Contracts for sign-in, sessions, recovery, the setup wizard and the profile's security tab. */

export const sessionStages = ['verify_two_factor', 'change_password', 'active'] as const;
export const sessionStageSchema = z.enum(sessionStages);
export type SessionStage = z.infer<typeof sessionStageSchema>;

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordInputSchema = z.string().min(1).max(128);

export const signInRequestSchema = z.object({
  email: emailSchema,
  password: passwordInputSchema,
  rememberMe: z.boolean().default(false),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  isSuperAdmin: z.boolean(),
  permissions: z.array(z.string()),
  mustChangePassword: z.boolean(),
  twoFactorEnabled: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionInfoSchema = z.object({
  id: z.string().uuid(),
  stage: sessionStageSchema,
  user: sessionUserSchema,
  idleExpiresAt: z.string().datetime(),
  absoluteExpiresAt: z.string().datetime(),
  warningMinutes: z.number().int(),
  setupComplete: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const signInResponseSchema = z.object({
  stage: sessionStageSchema,
  next: z.enum(['/setup', '/change-password', '/two-factor', '/dashboard']),
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: passwordInputSchema,
  newPassword: passwordInputSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(16).max(256),
  newPassword: passwordInputSchema,
});

export const passwordCheckRequestSchema = z.object({
  password: z.string().max(256),
  email: emailSchema.optional(),
  fullName: z.string().max(200).optional(),
});
export const passwordCheckResponseSchema = z.object({
  ok: z.boolean(),
  score: z.number().int().min(0).max(4),
  problems: z.array(z.string()),
});
export type PasswordCheckResponse = z.infer<typeof passwordCheckResponseSchema>;

export const sessionListItemSchema = z.object({
  id: z.string().uuid(),
  current: z.boolean(),
  deviceLabel: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});
export type SessionListItem = z.infer<typeof sessionListItemSchema>;
export const sessionListSchema = z.object({ sessions: z.array(sessionListItemSchema) });

export const profileSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  isSuperAdmin: z.boolean(),
  twoFactorEnabled: z.boolean(),
  passwordChangedAt: z.string().datetime().nullable(),
  lastSignInAt: z.string().datetime().nullable(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    density: z.enum(['comfortable', 'compact']),
    timeZone: z.string().nullable(),
    dateFormat: z.string().nullable(),
  }),
});
export type Profile = z.infer<typeof profileSchema>;

export const updateProfileRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
});
export const updatePreferencesRequestSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  timeZone: z.string().max(64).nullable().optional(),
  dateFormat: z.string().max(32).nullable().optional(),
});

/** First-run setup */
export const setupStatusSchema = z.object({
  passwordChanged: z.boolean(),
  organizationCreated: z.boolean(),
  headOfficeCreated: z.boolean(),
  complete: z.boolean(),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const setupOrganizationRequestSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  tradingName: z.string().trim().max(200).optional(),
  countryCode: z.string().length(2).toUpperCase(),
  currencyCode: z.string().length(3).toUpperCase(),
  timeZone: z.string().min(1).max(64),
  addressLines: z.array(z.string().trim().max(200)).max(6).default([]),
  headOffice: z.object({
    name: z.string().trim().min(1).max(200),
    addressLines: z.array(z.string().trim().max(200)).max(6).default([]),
  }),
});
export type SetupOrganizationRequest = z.infer<typeof setupOrganizationRequestSchema>;

export const CSRF_HEADER = 'x-csrf-token';
