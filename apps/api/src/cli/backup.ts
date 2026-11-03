import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createPrismaClient } from '../platform/database/prisma.service';
import type { Env } from '../platform/config/config';
import { createLogger } from '../platform/logging/logger';
import { createRedis } from '../platform/redis/redis.service';
import {
  applyRetention,
  backupDir,
  backupStatus,
  filePathOf,
  readManifest,
  restoreLive,
  runBackup,
  runDrill,
  verifyBackup,
  type BackupDeps,
} from '../modules/backups/engine';
import { verifyFile } from '../modules/backups/backup-file';
import { effectiveKey } from '../platform/config/config';

/**
 * `inspower backup run [--kind manual|pre_release]`, `backup list`, `backup verify <file|id>
 * [--drill]`, `backup prune`, `backup restore <file|id> --confirm`. The person at the keyboard
 * is the preferred way to restore (docs/runbooks/backup-and-restore.md).
 */
export async function backupCommand(env: Env, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const flags = parse(rest);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL, env.REDIS_PREFIX);
  redis.on('error', () => undefined);
  await redis.connect().catch(() => undefined);
  const queueConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  queueConnection.on('error', () => undefined);
  const emailQueue = new Queue('email', {
    connection: queueConnection,
    prefix: `${env.REDIS_PREFIX}:bull`,
  });
  const deps: BackupDeps = { env, prisma, emailQueue, logger: createLogger('warn', 'cli'), redis };
  try {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) {
      console.error('No organization yet; finish setup first.');
      return 1;
    }
    switch (sub) {
      case 'run': {
        const kind = flags['kind'] === 'pre_release' ? 'pre_release' : 'manual';
        const r = await runBackup(deps, { organizationId: org.id, kind });
        console.log(`Backup written: ${path.join(backupDir(env), r.fileName)}`);
        return 0;
      }
      case 'list': {
        const rows = await prisma.backup.findMany({
          where: { organizationId: org.id },
          orderBy: { startedAt: 'desc' },
          take: 50,
        });
        for (const r of rows) {
          console.log(
            `${r.id}  ${r.status.padEnd(9)} ${r.kind.padEnd(11)} ${r.startedAt.toISOString()}  ${r.fileName ?? ''}  ${r.sizeBytes ? `${(Number(r.sizeBytes) / 1024).toFixed(0)} KiB` : ''}${r.restoreTestedAt ? '  drilled' : ''}`,
          );
        }
        const status = await backupStatus(deps, org.id);
        console.log(
          `\nKey fingerprint ${status.keyFingerprint}; folder ${status.localDir}${status.missed ? '; MISSED: no backup in the last day' : ''}`,
        );
        return 0;
      }
      case 'verify': {
        const ref = flags._[0];
        if (!ref) return usage();
        const row = await resolveBackup(prisma, env, ref);
        if (row.id) {
          if (flags['drill'] !== undefined) {
            console.log(await runDrill(deps, org.id, row.id));
          } else {
            await verifyBackup(deps, row.id);
            console.log('Checksum and authentication tag are good.');
          }
        } else {
          await verifyFile(row.file, effectiveKey(env, 'BACKUP_ENCRYPTION_KEY'), row.manifest);
          console.log('Checksum and authentication tag are good (file is not in the database).');
        }
        return 0;
      }
      case 'prune': {
        console.log(await applyRetention(deps, org.id));
        return 0;
      }
      case 'restore': {
        const ref = flags._[0];
        if (!ref) return usage();
        if (flags['confirm'] === undefined) {
          console.error('Restoring replaces the live database. Add --confirm to proceed.');
          return 2;
        }
        const row = await resolveBackup(prisma, env, ref);
        console.log(`Restoring ${row.file} ...`);
        const result = await restoreLive(deps, {
          organizationId: org.id,
          file: row.file,
          manifest: row.manifest,
          backupId: row.id,
        });
        console.log(
          `Done. The previous database is kept as ${result.oldDatabase}; drop it when you are sure.`,
        );
        return 0;
      }
      default:
        return usage();
    }
  } finally {
    await emailQueue.close().catch(() => undefined);
    await Promise.all([redis.quit(), queueConnection.quit(), prisma.$disconnect()]).catch(
      () => undefined,
    );
  }
}

function usage(): number {
  console.error(
    'Usage: inspower backup <run [--kind manual|pre_release] | list | verify <file|id> [--drill] | prune | restore <file|id> --confirm>',
  );
  return 2;
}

interface Flags {
  _: string[];
  [flag: string]: string | string[] | undefined;
}

function parse(args: string[]): Flags {
  const out: Flags = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out[a.slice(2)] = next;
        i += 1;
      } else out[a.slice(2)] = '';
    } else out._.push(a);
  }
  return out;
}

async function resolveBackup(
  prisma: ReturnType<typeof createPrismaClient>,
  env: Env,
  ref: string,
): Promise<{
  id: string | null;
  file: string;
  manifest: Awaited<ReturnType<typeof readManifest>>;
}> {
  if (/^[0-9a-f-]{36}$/.test(ref)) {
    const row = await prisma.backup.findUniqueOrThrow({ where: { id: ref } });
    if (!row.fileName) throw new Error('This backup has no file');
    return {
      id: row.id,
      file: filePathOf(env, row.fileName),
      manifest: await readManifest(env, row.fileName),
    };
  }
  const file = path.isAbsolute(ref) ? ref : path.resolve(ref);
  await stat(file);
  const name = path.basename(file);
  const row = await prisma.backup.findFirst({ where: { fileName: name } });
  const manifest = path.dirname(file) === backupDir(env) ? await readManifest(env, name) : null;
  return { id: row?.id ?? null, file, manifest };
}
