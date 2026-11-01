import type { Job, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../generated/prisma/client';
import type { BackupJob } from '../modules/backups/backups.service';
import {
  filePathOf,
  readManifest,
  restoreLive,
  runBackup,
  runDrill,
  verifyBackup,
  type BackupDeps,
} from '../modules/backups/engine';
import type { Env } from '../platform/config/config';
import type { Logger } from '../platform/logging/logger';

/** The `backup` queue: on-demand backups, drills, verifications and the scheduled restore. */
export function backupProcessor(
  env: Env,
  prisma: PrismaClient,
  emailQueue: Queue,
  redis: Redis,
  logger: Logger,
) {
  const deps: BackupDeps = { env, prisma, emailQueue, logger, redis };
  return async (job: Job<BackupJob>): Promise<string> => {
    const data = job.data;
    switch (data.kind) {
      case 'run': {
        const r = await runBackup(deps, {
          organizationId: data.organizationId,
          kind: data.backupKind,
          startedBy: data.startedBy,
        });
        return r.fileName;
      }
      case 'verify':
        await verifyBackup(deps, data.backupId, data.actorId);
        return 'verified';
      case 'drill':
        return runDrill(deps, data.organizationId, data.backupId);
      case 'restore': {
        const row = await prisma.backup.findUniqueOrThrow({ where: { id: data.backupId } });
        if (!row.fileName) throw new Error('This backup has no file');
        const result = await restoreLive(deps, {
          organizationId: data.organizationId,
          file: filePathOf(env, row.fileName),
          manifest: await readManifest(env, row.fileName),
          actorId: data.actorId,
          backupId: row.id,
        });
        return `restored; previous database kept as ${result.oldDatabase}`;
      }
      default:
        throw new Error(`Unknown backup job ${(data as { kind: string }).kind}`);
    }
  };
}
