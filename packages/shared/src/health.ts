import { z } from 'zod';

export const healthStatus = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof healthStatus>;

/** Public, shallow health: safe to expose without a session. */
export const healthSchema = z.object({
  status: healthStatus,
  version: z.string(),
  time: z.string().datetime(),
});
export type Health = z.infer<typeof healthSchema>;

export const healthCheckSchema = z.object({
  status: healthStatus,
  latencyMs: z.number().nonnegative().optional(),
  detail: z.string().optional(),
});
export type HealthCheck = z.infer<typeof healthCheckSchema>;

/** Admin-only detailed health. */
export const healthDetailsSchema = healthSchema.extend({
  checks: z.object({
    database: healthCheckSchema,
    redis: healthCheckSchema,
    worker: healthCheckSchema,
    mail: healthCheckSchema,
    backup: healthCheckSchema.optional(),
    disk: healthCheckSchema.optional(),
  }),
});
export type HealthDetails = z.infer<typeof healthDetailsSchema>;

/** The worst of several checks decides the overall status. */
export function overallStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.some((c) => c.status === 'down')) return 'down';
  if (checks.some((c) => c.status === 'degraded')) return 'degraded';
  return 'ok';
}
