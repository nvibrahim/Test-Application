import { Queue, type Job } from 'bullmq';
import { scheduledJobRegistry } from '@inspower/shared';
import type { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../platform/config/config';
import type { Logger } from '../platform/logging/logger';
import { maintenanceTasks } from '../scheduler/maintenance';

/**
 * Repeating jobs: one BullMQ job scheduler per registry entry on the `maintenance` queue, so
 * every run is an ordinary job (visible, retried, never two at once for the same key). Each
 * run updates its `scheduled_jobs` row. Phase 7 adds pause, resume, run now and the screen.
 */
export async function registerSchedules(
  queue: Queue,
  prisma: PrismaClient,
  logger: Logger,
): Promise<void> {
  const org = await prisma.organization.findFirst({ select: { id: true, timeZone: true } });
  for (const job of scheduledJobRegistry) {
    const tz = job.inOrganizationTime && org?.timeZone ? org.timeZone : 'UTC';
    await queue.upsertJobScheduler(
      job.key,
      { pattern: job.cron, tz },
      { name: job.key, data: { key: job.key }, opts: { removeOnComplete: 100, removeOnFail: 100 } },
    );
    if (org) {
      await prisma.scheduledJob.upsert({
        where: { key: job.key },
        update: {},
        create: { key: job.key, organizationId: org.id },
      });
    }
  }
  logger.info({ jobs: scheduledJobRegistry.map((j) => j.key) }, 'schedules registered');
}

export function maintenanceProcessor(
  env: Env,
  prisma: PrismaClient,
  emailQueue: Queue,
  logger: Logger,
) {
  return async (job: Job<{ key: string }>): Promise<string> => {
    const key = job.data.key ?? job.name;
    const task = maintenanceTasks[key];
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!task) throw new Error(`No maintenance task for ${key}`);
    if (!org) return 'No organization yet';
    const now = new Date();
    try {
      const result = await task({ env, prisma, emailQueue, logger, organizationId: org.id, now });
      await prisma.scheduledJob.upsert({
        where: { key },
        update: { lastRunAt: now, lastResult: result, lastError: null },
        create: { key, organizationId: org.id, lastRunAt: now, lastResult: result },
      });
      logger.info({ key, result }, 'scheduled job ran');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.scheduledJob.upsert({
        where: { key },
        update: { lastRunAt: now, lastError: message },
        create: { key, organizationId: org.id, lastRunAt: now, lastError: message },
      });
      throw error;
    }
  };
}
