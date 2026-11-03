import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { backupSettingsSchema, type Backup, type BackupStatusSummary } from '@inspower/shared';
import { writeAudit } from '../../platform/audit/audit';
import { effectiveKey, type Env } from '../../platform/config/config';
import { keyFingerprint } from '../../platform/crypto/crypto';
import type { PrismaClient } from '../../generated/prisma/client';
import type { Logger } from '../../platform/logging/logger';
import {
  backupFileName,
  decryptFromFile,
  encryptToFile,
  manifestFileName,
  verifyFile,
  type BackupManifest,
} from './backup-file';
import { BackupActions } from './backups.actions';
import { notifyAdministrators } from './admin-notify';
import {
  countRows,
  createEmptyDatabase,
  dropDatabaseIfExists,
  latestMigration,
  parseDatabaseUrl,
  pgDump,
  pgRestore,
  swapDatabases,
  withDatabase,
  type DatabaseTarget,
} from './pg';
import { selectBackupsToKeep } from './retention';
import { openTargetConfig, S3Target, type OffsiteTarget } from './targets';

/**
 * Everything backups do, as plain functions over the Prisma client, so the API, the worker and
 * the command line share one implementation. The runbook (docs/runbooks/backup-and-restore.md)
 * is the specification; the integration tests run these against a real database.
 */
export interface BackupDeps {
  env: Env;
  prisma: PrismaClient;
  emailQueue: Queue;
  logger: Logger;
  /** Needed for a live restore (drops the settings cache when maintenance mode flips). */
  redis?: Redis;
}

export const MISSED_AFTER_HOURS = 26;

function backupKey(env: Env): Buffer {
  return effectiveKey(env, 'BACKUP_ENCRYPTION_KEY');
}
function authKey(env: Env): Buffer {
  return effectiveKey(env, 'AUTH_ENCRYPTION_KEY');
}

export function backupDir(env: Env): string {
  return path.resolve(env.BACKUP_DIR);
}

export function filePathOf(env: Env, fileName: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName) || fileName.includes('..')) {
    throw new Error('Backup file name is not allowed');
  }
  return path.join(backupDir(env), fileName);
}

export async function readManifest(env: Env, fileName: string): Promise<BackupManifest | null> {
  try {
    return JSON.parse(
      await readFile(filePathOf(env, manifestFileName(fileName)), 'utf8'),
    ) as BackupManifest;
  } catch {
    return null;
  }
}

async function announce(prisma: PrismaClient, organizationId: string): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      organizationId,
      name: 'backups.backup.changed',
      channels: ['organization'],
      payload: {},
    },
  });
}

export async function offsiteTargetFor(
  deps: BackupDeps,
  organizationId: string,
): Promise<{ id: string; name: string; target: OffsiteTarget } | null> {
  const settings = await readBackupSettings(deps.prisma, organizationId);
  if (!settings.offsiteTargetId) return null;
  const row = await deps.prisma.backupTarget.findUnique({
    where: { id: settings.offsiteTargetId },
  });
  if (!row || !row.isEnabled || !row.configEncrypted) return null;
  const config = openTargetConfig(row.configEncrypted, authKey(deps.env), row.id);
  return { id: row.id, name: row.name, target: new S3Target(config) };
}

export async function readBackupSettings(prisma: PrismaClient, organizationId: string) {
  const rows = await prisma.appSetting.findMany({
    where: { organizationId, section: 'backups' },
    select: { key: true, value: true },
  });
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  const parsed = backupSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : backupSettingsSchema.parse({});
}

/** Takes a backup: row, pg_dump through the cipher to disk, manifest, off-site copy. */
export async function runBackup(
  deps: BackupDeps,
  input: { organizationId: string; kind: Backup['kind']; startedBy?: string | null },
): Promise<{ id: string; fileName: string }> {
  const { env, prisma, logger } = deps;
  const target = parseDatabaseUrl(env.DATABASE_URL);
  const key = backupKey(env);
  const startedAt = new Date();
  const fileName = backupFileName(input.kind, startedAt);
  await mkdir(backupDir(env), { recursive: true });
  const row = await prisma.backup.create({
    data: {
      organizationId: input.organizationId,
      kind: input.kind,
      status: 'running',
      fileName,
      encryptionKeyFingerprint: keyFingerprint(key),
      appVersion: env.APP_VERSION,
      startedBy: input.startedBy ?? null,
      startedAt,
    },
  });
  await writeAudit(
    prisma,
    { organizationId: input.organizationId, actorId: input.startedBy ?? null },
    {
      action: BackupActions.started,
      entityType: 'backup',
      entityId: row.id,
      changes: { kind: input.kind },
    },
  );
  await announce(prisma, input.organizationId);
  const file = filePathOf(env, fileName);
  try {
    const [migrationId, rowCounts] = await Promise.all([
      latestMigration(target),
      countRows(target),
    ]);
    const dump = pgDump(env.PG_BIN_DIR, target);
    const [written] = await Promise.all([encryptToFile(dump.stdout, file, key), dump.done]);
    const finishedAt = new Date();
    const manifest: BackupManifest = {
      version: 1,
      fileName,
      kind: input.kind,
      appVersion: env.APP_VERSION,
      migrationId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      checksum: written.checksum,
      sizeBytes: written.sizeBytes,
      keyFingerprint: keyFingerprint(key),
      rowCounts,
    };
    await writeFile(
      filePathOf(env, manifestFileName(fileName)),
      JSON.stringify(manifest, null, 2),
      {
        mode: 0o600,
      },
    );
    await prisma.backup.update({
      where: { id: row.id },
      data: {
        status: 'completed',
        sizeBytes: BigInt(written.sizeBytes),
        checksum: written.checksum,
        migrationId,
        finishedAt,
        rowCounts,
      },
    });
    await writeAudit(
      prisma,
      { organizationId: input.organizationId, actorId: input.startedBy ?? null },
      {
        action: BackupActions.completed,
        entityType: 'backup',
        entityId: row.id,
        changes: { fileName, sizeBytes: written.sizeBytes, migrationId },
      },
    );
    logger.info({ fileName, sizeBytes: written.sizeBytes }, 'backup completed');
    await copyOffsite(deps, row.id).catch((err: Error) =>
      logger.warn({ err }, 'off-site copy failed'),
    );
    await announce(prisma, input.organizationId);
    return { id: row.id, fileName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await rm(file, { force: true }).catch(() => undefined);
    await prisma.backup.update({
      where: { id: row.id },
      data: { status: 'failed', error: message, finishedAt: new Date() },
    });
    await prisma.$transaction(async (tx) => {
      await writeAudit(
        tx,
        { organizationId: input.organizationId, actorId: input.startedBy ?? null },
        {
          action: BackupActions.failed,
          entityType: 'backup',
          entityId: row.id,
          changes: { message },
        },
      );
      await notifyAdministrators(tx, deps, input.organizationId, {
        type: 'admin.backup_failed',
        title: 'A backup failed',
        body: message,
        link: '/admin/backups',
        adminEvent: 'backups.failed',
      });
    });
    await announce(prisma, input.organizationId);
    logger.error({ err: error }, 'backup failed');
    throw error;
  }
}

/** Copies the file and its manifest to the chosen off-site target, if there is one. */
export async function copyOffsite(deps: BackupDeps, backupId: string): Promise<boolean> {
  const row = await deps.prisma.backup.findUniqueOrThrow({ where: { id: backupId } });
  if (!row.fileName || row.status !== 'completed') return false;
  const offsite = await offsiteTargetFor(deps, row.organizationId);
  if (!offsite) return false;
  try {
    await offsite.target.put(
      row.fileName,
      filePathOf(deps.env, row.fileName),
      'application/octet-stream',
    );
    await offsite.target.put(
      manifestFileName(row.fileName),
      filePathOf(deps.env, manifestFileName(row.fileName)),
      'application/json',
    );
    await deps.prisma.backup.update({
      where: { id: row.id },
      data: { targetId: offsite.id, offsiteCopiedAt: new Date(), offsiteError: null },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.prisma.backup.update({ where: { id: row.id }, data: { offsiteError: message } });
    throw error;
  }
}

/** Tag and checksum, no restore. */
export async function verifyBackup(
  deps: BackupDeps,
  backupId: string,
  actorId?: string | null,
): Promise<void> {
  const row = await deps.prisma.backup.findUniqueOrThrow({ where: { id: backupId } });
  if (!row.fileName) throw new Error('This backup has no file');
  const manifest = await readManifest(deps.env, row.fileName);
  await verifyFile(filePathOf(deps.env, row.fileName), backupKey(deps.env), manifest);
  await writeAudit(
    deps.prisma,
    { organizationId: row.organizationId, actorId: actorId ?? null },
    { action: BackupActions.verified, entityType: 'backup', entityId: row.id },
  );
}

/**
 * The restore drill: newest completed backup into `<db>_drill`, row counts against the
 * manifest, drop. Records restore_tested_at; tells administrators about a failure.
 */
export async function runDrill(
  deps: BackupDeps,
  organizationId: string,
  backupId?: string,
): Promise<string> {
  const { env, prisma } = deps;
  const row = backupId
    ? await prisma.backup.findUniqueOrThrow({ where: { id: backupId } })
    : await prisma.backup.findFirst({
        where: { organizationId, status: 'completed' },
        orderBy: { finishedAt: 'desc' },
      });
  if (!row?.fileName) return 'No completed backup to drill';
  const live = parseDatabaseUrl(env.DATABASE_URL);
  const scratch = withDatabase(live, `${live.database}_drill`);
  try {
    const manifest = await readManifest(env, row.fileName);
    await verifyFile(filePathOf(env, row.fileName), backupKey(env), manifest);
    await dropDatabaseIfExists(live, scratch.database);
    await createEmptyDatabase(live, scratch.database);
    await pgRestore(
      env.PG_BIN_DIR,
      scratch,
      await decryptFromFile(filePathOf(env, row.fileName), backupKey(env)),
    );
    const counts = await countRows(scratch);
    const expected = (row.rowCounts as Record<string, number> | null) ?? manifest?.rowCounts ?? {};
    for (const [table, n] of Object.entries(expected)) {
      if (counts[table] !== n)
        throw new Error(`Table ${table} has ${counts[table]} rows, expected ${n}`);
    }
    await prisma.backup.update({ where: { id: row.id }, data: { restoreTestedAt: new Date() } });
    await writeAudit(
      prisma,
      { organizationId },
      {
        action: BackupActions.drillPassed,
        entityType: 'backup',
        entityId: row.id,
        changes: { counts },
      },
    );
    await announce(prisma, organizationId);
    return `Restored ${row.fileName} into ${scratch.database}; ${Object.keys(expected).length} tables matched`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$transaction(async (tx) => {
      await writeAudit(
        tx,
        { organizationId },
        {
          action: BackupActions.drillFailed,
          entityType: 'backup',
          entityId: row.id,
          changes: { message },
        },
      );
      await notifyAdministrators(tx, deps, organizationId, {
        type: 'admin.drill_failed',
        title: 'The restore drill failed',
        body: message,
        link: '/admin/backups',
        adminEvent: 'backups.drill_failed',
      });
    });
    throw error;
  } finally {
    await dropDatabaseIfExists(live, scratch.database).catch(() => undefined);
  }
}

/** Keeps the newest daily, weekly and monthly backups per Settings; removes files and rows. */
export async function applyRetention(deps: BackupDeps, organizationId: string): Promise<string> {
  const { env, prisma } = deps;
  const settings = await readBackupSettings(prisma, organizationId);
  const rows = await prisma.backup.findMany({
    where: { organizationId, status: 'completed', finishedAt: { not: null } },
    select: { id: true, finishedAt: true, fileName: true, targetId: true, offsiteCopiedAt: true },
  });
  const { remove } = selectBackupsToKeep(
    rows.map((r) => ({ ...r, finishedAt: r.finishedAt! })),
    settings.retention,
  );
  const offsite = await offsiteTargetFor(deps, organizationId).catch(() => null);
  for (const r of remove) {
    if (r.fileName) {
      await rm(filePathOf(env, r.fileName), { force: true });
      await rm(filePathOf(env, manifestFileName(r.fileName)), { force: true });
      if (offsite && r.offsiteCopiedAt && r.targetId === offsite.id) {
        await offsite.target.delete(r.fileName).catch(() => undefined);
        await offsite.target.delete(manifestFileName(r.fileName)).catch(() => undefined);
      }
    }
    await prisma.backup.delete({ where: { id: r.id } });
  }
  // Failed rows older than the daily window are noise; keep the newest few for the screen.
  const staleFailed = await prisma.backup.findMany({
    where: { organizationId, status: 'failed' },
    orderBy: { startedAt: 'desc' },
    skip: 10,
    select: { id: true },
  });
  if (staleFailed.length)
    await prisma.backup.deleteMany({ where: { id: { in: staleFailed.map((s) => s.id) } } });
  if (remove.length) {
    await writeAudit(
      prisma,
      { organizationId },
      {
        action: BackupActions.pruned,
        entityType: 'backup',
        changes: { removed: remove.map((r) => r.fileName) },
      },
    );
    await announce(prisma, organizationId);
  }
  return `Removed ${remove.length} of ${rows.length} backups`;
}

/** No success in 26 hours (and the organization is older than that): tell administrators once a day. */
export async function checkMissed(
  deps: BackupDeps,
  organizationId: string,
  now = new Date(),
): Promise<boolean> {
  const status = await backupStatus(deps, organizationId, now);
  if (!status.missed) return false;
  const since = new Date(now.getTime() - 20 * 3_600_000);
  const already = await deps.prisma.notification.findFirst({
    where: { organizationId, type: 'admin.backup_missed', createdAt: { gt: since } },
    select: { id: true },
  });
  if (already) return true;
  await deps.prisma.$transaction((tx) =>
    notifyAdministrators(tx, deps, organizationId, {
      type: 'admin.backup_missed',
      title: 'No backup in the last day',
      body: status.lastSuccessAt
        ? `The last successful backup was ${new Date(status.lastSuccessAt).toLocaleString('en-GB')}.`
        : 'No backup has ever completed.',
      link: '/admin/backups',
      adminEvent: 'backups.missed',
    }),
  );
  return true;
}

export async function backupStatus(
  deps: BackupDeps,
  organizationId: string,
  now = new Date(),
): Promise<BackupStatusSummary> {
  const { prisma, env } = deps;
  const [last, offsite, drill, drillJob, org, settings] = await Promise.all([
    prisma.backup.findFirst({
      where: { organizationId, status: 'completed' },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    }),
    prisma.backup.findFirst({
      where: { organizationId, offsiteCopiedAt: { not: null } },
      orderBy: { offsiteCopiedAt: 'desc' },
      select: { offsiteCopiedAt: true },
    }),
    prisma.backup.findFirst({
      where: { organizationId, restoreTestedAt: { not: null } },
      orderBy: { restoreTestedAt: 'desc' },
      select: { restoreTestedAt: true },
    }),
    prisma.scheduledJob.findUnique({ where: { key: 'restore-drill' } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { createdAt: true } }),
    readBackupSettings(prisma, organizationId),
  ]);
  const target = settings.offsiteTargetId
    ? await prisma.backupTarget.findUnique({
        where: { id: settings.offsiteTargetId },
        select: { name: true },
      })
    : null;
  const limit = now.getTime() - MISSED_AFTER_HOURS * 3_600_000;
  const orgOldEnough = !!org && org.createdAt.getTime() < limit;
  const missed = orgOldEnough && (!last?.finishedAt || last.finishedAt.getTime() < limit);
  const lastDrillAt = drill?.restoreTestedAt ?? null;
  const drillFailedLater =
    !!drillJob?.lastError &&
    !!drillJob.lastRunAt &&
    (!lastDrillAt || drillJob.lastRunAt > lastDrillAt);
  return {
    lastSuccessAt: last?.finishedAt?.toISOString() ?? null,
    lastOffsiteAt: offsite?.offsiteCopiedAt?.toISOString() ?? null,
    lastDrillAt: (drillFailedLater ? drillJob?.lastRunAt : lastDrillAt)?.toISOString() ?? null,
    lastDrillPassed: drillFailedLater ? false : lastDrillAt ? true : null,
    keyFingerprint: keyFingerprint(backupKey(env)),
    localDir: backupDir(env),
    offsiteTarget: target?.name ?? null,
    missed,
  };
}

/** Writes the Maintenance section's `enabled` flag directly and drops its cache. */
export async function setMaintenance(
  deps: BackupDeps,
  organizationId: string,
  enabled: boolean,
  message?: string,
): Promise<void> {
  const upsert = (key: string, value: unknown) =>
    deps.prisma.appSetting.upsert({
      where: { organizationId_section_key: { organizationId, section: 'maintenance', key } },
      update: { value: value as object },
      create: {
        organizationId,
        section: 'maintenance',
        key,
        value: value as object,
        isSecret: false,
      },
    });
  await upsert('enabled', enabled);
  if (message !== undefined) await upsert('message', message);
  await deps.redis
    ?.del(`settings:${deps.env.APP_VERSION}:${organizationId}:maintenance`)
    .catch(() => undefined);
}

function migrateDatabase(url: string, logger: Logger): Promise<void> {
  const bin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma');
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      logger.info({ code }, 'prisma migrate deploy on the restored database');
      if (code === 0) resolve();
      else
        reject(new Error(`prisma migrate deploy exited with ${code}: ${out.trim().slice(-500)}`));
    });
  });
}

/**
 * The real restore, exactly as the runbook lists it: verify, maintenance on, restore into a
 * fresh database, migrate, swap, maintenance off, audit. The old database is kept as
 * `<db>_old_<stamp>` for the operator to drop.
 */
export async function restoreLive(
  deps: BackupDeps,
  input: {
    organizationId: string;
    file: string;
    manifest: BackupManifest | null;
    actorId?: string | null;
    backupId?: string | null;
  },
): Promise<{ oldDatabase: string }> {
  const { env, prisma, logger } = deps;
  const live = parseDatabaseUrl(env.DATABASE_URL);
  const key = backupKey(env);
  const fresh = `${live.database}_restore`;
  const old = `${live.database}_old_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;
  const audit = (action: string, changes: Record<string, unknown>) =>
    writeAudit(
      prisma,
      { organizationId: input.organizationId, actorId: input.actorId ?? null },
      {
        action,
        entityType: 'backup',
        entityId: input.backupId ?? null,
        changes,
      },
    );
  await verifyFile(input.file, key, input.manifest);
  const previousMaintenance = await prisma.appSetting.findUnique({
    where: {
      organizationId_section_key: {
        organizationId: input.organizationId,
        section: 'maintenance',
        key: 'enabled',
      },
    },
  });
  await setMaintenance(
    deps,
    input.organizationId,
    true,
    'A restore is in progress. Back in a few minutes.',
  );
  try {
    await dropDatabaseIfExists(live, fresh);
    await createEmptyDatabase(live, fresh);
    const freshTarget = withDatabase(live, fresh);
    await pgRestore(env.PG_BIN_DIR, freshTarget, await decryptFromFile(input.file, key));
    await migrateDatabase(freshTarget.url, logger);
    // The audit row for the swap goes into the restored database, which is about to become live.
    await swapDatabases(live, fresh, old);
    await audit(BackupActions.restoreCompleted, {
      file: path.basename(input.file),
      oldDatabase: old,
    });
    if (previousMaintenance?.value !== true)
      await setMaintenance(deps, input.organizationId, false);
    await announce(prisma, input.organizationId);
    logger.info({ old }, 'restore completed');
    return { oldDatabase: old };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await audit(BackupActions.restoreFailed, { message }).catch(() => undefined);
    await dropDatabaseIfExists(live, fresh).catch(() => undefined);
    if (previousMaintenance?.value !== true)
      await setMaintenance(deps, input.organizationId, false).catch(() => undefined);
    throw error;
  }
}

export function serializeBackup(
  row: {
    id: string;
    kind: Backup['kind'];
    status: Backup['status'];
    fileName: string | null;
    sizeBytes: bigint | null;
    checksum: string | null;
    encryptionKeyFingerprint: string | null;
    appVersion: string | null;
    migrationId: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    restoreTestedAt: Date | null;
    offsiteCopiedAt: Date | null;
    offsiteError: string | null;
    error: string | null;
  },
  startedByName: string | null,
): Backup {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    checksum: row.checksum,
    keyFingerprint: row.encryptionKeyFingerprint,
    appVersion: row.appVersion,
    migrationId: row.migrationId,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    restoreTestedAt: row.restoreTestedAt?.toISOString() ?? null,
    offsiteCopiedAt: row.offsiteCopiedAt?.toISOString() ?? null,
    offsiteError: row.offsiteError,
    error: row.error,
    startedByName,
  };
}

export type { DatabaseTarget };
