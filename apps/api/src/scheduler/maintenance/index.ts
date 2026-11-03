import type { Queue } from 'bullmq';
import type { PrismaClient } from '../../generated/prisma/client';
import type { Env } from '../../platform/config/config';
import type { Logger } from '../../platform/logging/logger';
import { outboxCleanup } from './outbox-cleanup';
import { retentionCleanup } from './retention-cleanup';
import { twoFactorReminder } from './two-factor-reminder';
import { backupNightly, backupRetention, restoreDrill } from './backups';

export interface MaintenanceContext {
  env: Env;
  prisma: PrismaClient;
  emailQueue: Queue;
  logger: Logger;
  organizationId: string;
  now: Date;
}

export type MaintenanceTask = (ctx: MaintenanceContext) => Promise<string>;

/** One task per entry in the shared `allScheduledJobs`. Adding a job: a registry entry plus a task here. */
export const maintenanceTasks: Record<string, MaintenanceTask> = {
  'outbox-cleanup': outboxCleanup,
  'retention-cleanup': retentionCleanup,
  'two-factor-reminder': twoFactorReminder,
  'backup-nightly': backupNightly,
  'backup-retention': backupRetention,
  'restore-drill': restoreDrill,
};
