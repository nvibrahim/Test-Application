import { z } from 'zod';

/** Stable error codes shared by the API and the web client. Add, never rename. */
export const errorCodes = [
  'validation_failed',
  'not_found',
  'unauthenticated',
  'forbidden',
  'conflict',
  'rate_limited',
  'csrf_failed',
  'step_up_required',
  'temporarily_unavailable',
  'internal_error',
  'invalid_credentials',
  'account_locked',
  'account_disabled',
  'wrong_stage',
  'setup_required',
  'password_rejected',
  'token_invalid',
  'invalid_code',
  'two_factor_not_set_up',
  'last_super_admin',
  'reserved_permission',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const apiErrorSchema = z.object({
  code: z.enum(errorCodes),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const httpStatusFor: Record<ErrorCode, number> = {
  validation_failed: 400,
  not_found: 404,
  unauthenticated: 401,
  forbidden: 403,
  conflict: 409,
  rate_limited: 429,
  csrf_failed: 403,
  step_up_required: 403,
  temporarily_unavailable: 503,
  internal_error: 500,
  invalid_credentials: 401,
  account_locked: 423,
  account_disabled: 403,
  wrong_stage: 403,
  setup_required: 403,
  password_rejected: 422,
  token_invalid: 400,
  invalid_code: 401,
  two_factor_not_set_up: 409,
  last_super_admin: 409,
  reserved_permission: 403,
};
