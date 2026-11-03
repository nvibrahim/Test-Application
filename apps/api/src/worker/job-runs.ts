import type { Job } from 'bullmq';
import type { PrismaClient } from '../generated/prisma/client';
import type { Logger } from '../platform/logging/logger';

/**
 * Every job the worker picks up gets a `job_runs` row: running when it starts, completed or
 * failed when it ends, with a short summary of its input and result. The Jobs screen reads this
 * table; Bull Board reads the queues themselves.
 */
export function recordJobRuns(
  prisma: PrismaClient,
  logger: Logger,
  process: (job: Job) => Promise<unknown>,
) {
  return async (job: Job): Promise<unknown> => {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    const started = new Date();
    const where = { queue_jobId: { queue: job.queueName, jobId: String(job.id) } };
    const summary = summarise(job.data);
    if (org) {
      await prisma.jobRun
        .upsert({
          where,
          update: {
            status: 'running',
            attempts: job.attemptsMade + 1,
            startedAt: started,
            error: null,
          },
          create: {
            organizationId: org.id,
            queue: job.queueName,
            name: job.name,
            jobId: String(job.id),
            status: 'running',
            attempts: job.attemptsMade + 1,
            inputSummary: summary as object,
            startedBy: (job.data as { startedBy?: string } | undefined)?.startedBy ?? null,
            queuedAt: new Date(job.timestamp),
            startedAt: started,
          },
        })
        .catch((err: unknown) => logger.warn({ err }, 'could not record job start'));
    }
    try {
      const result = await process(job);
      if (org) {
        await prisma.jobRun
          .update({
            where,
            data: {
              status: 'completed',
              finishedAt: new Date(),
              result: summarise(result) as object,
            },
          })
          .catch(() => undefined);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      if (org) {
        await prisma.jobRun
          .update({
            where,
            data: {
              status: willRetry ? 'queued' : 'failed',
              finishedAt: willRetry ? null : new Date(),
              error: message.slice(0, 2000),
            },
          })
          .catch(() => undefined);
      }
      throw error;
    }
  };
}

/** Keeps the row small and never stores a secret-looking field. */
function summarise(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object')
    return typeof value === 'string' ? value.slice(0, 500) : value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (/password|secret|token|key/i.test(k)) out[k] = '[hidden]';
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'object' && v !== null)
      out[k] = Array.isArray(v) ? `[${v.length} items]` : '{…}';
    else out[k] = v;
  }
  return out;
}
