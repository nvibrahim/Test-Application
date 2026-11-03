import { z } from 'zod';

/**
 * Audit actions are named `module.entity.action`, for example `auth.login.success`
 * or `settings.security.updated`. The rule is enforced here so every module agrees.
 */
export const auditActionPattern = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export const auditActionSchema = z.string().regex(auditActionPattern, {
  message: 'An audit action is module.entity.action in lower case',
});

export function isAuditAction(value: string): boolean {
  return auditActionPattern.test(value);
}

export const auditEntrySchema = z.object({
  id: z.string(),
  action: auditActionSchema,
  actorId: z.string().nullable(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  changes: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
