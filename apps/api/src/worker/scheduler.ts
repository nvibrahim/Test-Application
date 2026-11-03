import { Queue, type Job } from 'bullmq';
import { allScheduledJobs } from '@inspower/shared';
import { readBackupSettings } from '../modules/backups/engine';
import { nightlyCron } from '../modules/backups/retention';
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
  const backups = org ? await readBackupSettings(prisma, org.id) : null;
  for (const job of allScheduledJobs) {
    const tz = job.inOrganizationTime && org?.timeZone ? org.timeZone : 'UTC';
    const pattern =
      job.key === 'backup-nightly' && backups ? nightlyCron(backups.nightlyAt) : job.cron;
    const row = await prisma.scheduledJob.findUnique({ where: { key: job.key } });
    if (row?.isPaused) {
      await queue.removeJobScheduler(job.key).catch(() => undefined);
      continue;
    }
    await queue.upsertJobScheduler(
      job.key,
      { pattern, tz },
      { name: job.key, data: { key: job.key }, opts: { removeOnComplete: 100, removeOnFail: 100 } },
    );
    const scheduler = await queue.getJobScheduler(job.key).catch(() => null);
    const next = scheduler?.next ? new Date(scheduler.next) : null;
    // Catch-up: the previously recorded next run passed while the worker was off; run once now.
    if (
      job.catchUp &&
      row?.nextRunAt &&
      row.nextRunAt < new Date() &&
      (!row.lastRunAt || row.lastRunAt < row.nextRunAt)
    ) {
      await queue.add(
        job.key,
        { key: job.key, catchUp: true },
        { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
      );
      logger.info({ key: job.key, missed: row.nextRunAt }, 'catching up a missed scheduled run');
    }
    if (org) {
      await prisma.scheduledJob.upsert({
        where: { key: job.key },
        update: { nextRunAt: next },
        create: { key: job.key, organizationId: org.id, nextRunAt: next },
      });
    }
  }
  logger.info({ jobs: allScheduledJobs.map((j) => j.key) }, 'schedules registered');
}

export function maintenanceProcessor(
  env: Env,
  prisma: PrismaClient,
  emailQueue: Queue,
  maintenanceQueue: Queue,
  logger: Logger,
) {
  return async (
    job: Job<{ key: string; manual?: boolean; catchUp?: boolean }>,
  ): Promise<string> => {
    const key = job.data.key ?? job.name;
    const task = maintenanceTasks[key];
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!task) throw new Error(`No maintenance task for ${key}`);
    if (!org) return 'No organization yet';
    const row = await prisma.scheduledJob.findUnique({ where: { key } });
    if (row?.isPaused && !job.data.manual) return 'Paused; skipped';
    const now = new Date();
    try {
      const result = await task({ env, prisma, emailQueue, logger, organizationId: org.id, now });
      const scheduler = await maintenanceQueue.getJobScheduler(key).catch(() => null);
      await prisma.scheduledJob.upsert({
        where: { key },
        update: {
          lastRunAt: now,
          lastResult: result,
          lastError: null,
          nextRunAt: scheduler?.next ? new Date(scheduler.next) : undefined,
        },
        create: { key, organizationId: org.id, lastRunAt: now, lastResult: result },
      });
      await prisma.outboxEvent.create({
        data: {
          organizationId: org.id,
          name: 'jobs.schedule.ran',
          channels: ['organization'],
          payload: { key },
        },
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
