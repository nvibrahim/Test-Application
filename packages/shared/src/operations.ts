import { z } from 'zod';
import { auditActionSchema } from './audit.js';

/** Background jobs and scheduled jobs, as the operations screens see them. */
export const queueNameSchema = z.enum(['email', 'maintenance', 'backup', 'exports']);
export type QueueName = z.infer<typeof queueNameSchema>;

export const queueCountsSchema = z.object({
  name: queueNameSchema,
  waiting: z.number().int(),
  active: z.number().int(),
  delayed: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
  paused: z.boolean(),
});
export type QueueCounts = z.infer<typeof queueCountsSchema>;

export const jobRunStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']);

export const jobRunSchema = z.object({
  id: z.string().uuid(),
  queue: queueNameSchema,
  name: z.string(),
  jobId: z.string(),
  status: jobRunStatusSchema,
  attempts: z.number().int(),
  inputSummary: z.unknown().nullable(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  /** Whether the live job still exists in the queue (retry, cancel and remove need it). */
  live: z.boolean(),
});
export type JobRun = z.infer<typeof jobRunSchema>;

export const jobRunQuerySchema = z.object({
  queue: queueNameSchema.optional(),
  status: jobRunStatusSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const jobsResponseSchema = z.object({
  queues: z.array(queueCountsSchema),
  runs: z.array(jobRunSchema),
  nextCursor: z.string().nullable(),
});
export type JobsResponse = z.infer<typeof jobsResponseSchema>;

export const scheduledJobSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  cron: z.string(),
  timeZone: z.string(),
  catchUp: z.boolean(),
  isPaused: z.boolean(),
  lastRunAt: z.string().datetime().nullable(),
  lastResult: z.string().nullable(),
  lastError: z.string().nullable(),
  nextRunAt: z.string().datetime().nullable(),
});
export type ScheduledJobView = z.infer<typeof scheduledJobSchema>;
export const scheduledJobsResponseSchema = z.object({ jobs: z.array(scheduledJobSchema) });

/** Audit log screen. */
export const auditLogQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  /** Exact action or a prefix such as `users.` */
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  action: auditActionSchema,
  actorId: z.string().uuid().nullable(),
  actorName: z.string().nullable(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  changes: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditLogResponseSchema = z.object({
  entries: z.array(auditLogEntrySchema),
  nextCursor: z.string().nullable(),
  /** Distinct actions and entity types seen, for the filter controls. */
  actions: z.array(z.string()),
  entityTypes: z.array(z.string()),
});
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;

/** One CSV cell, RFC 4180: quoted when it holds a comma, quote or line break; a leading =,+,-,@ is prefixed so a spreadsheet never runs it. */
export function csvCell(value: unknown): string {
  let s =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(values: unknown[]): string {
  return values.map(csvCell).join(',');
}
