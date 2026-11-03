import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  createBackupTargetSchema,
  type Backup,
  type BackupStatusSummary,
  type BackupTarget,
} from '@inspower/shared';
import type { z } from 'zod';
import { effectiveKey, type Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException, notFound } from '../../platform/http/api-error';
import { QueueService } from '../../platform/jobs/queue.service';
import { createLogger } from '../../platform/logging/logger';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { SettingsReader } from '../settings/settings-reader';
import { BackupActions } from './backups.actions';
import { backupStatus, filePathOf, serializeBackup, type BackupDeps } from './engine';
import { nightlyCron } from './retention';
import { openTargetConfig, S3Target, sealTargetConfig } from './targets';

export type BackupJob =
  | { kind: 'run'; organizationId: string; backupKind: Backup['kind']; startedBy: string | null }
  | { kind: 'verify'; organizationId: string; backupId: string; actorId: string | null }
  | { kind: 'drill'; organizationId: string; backupId: string }
  | { kind: 'restore'; organizationId: string; backupId: string; actorId: string | null };

/** The API side: reads, queueing the work for the worker, downloads and off-site targets. */
@Injectable()
export class BackupsService {
  private readonly authKey: Buffer;
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly transactions: TransactionService,
    private readonly settings: SettingsReader,
  ) {
    this.authKey = effectiveKey(env, 'AUTH_ENCRYPTION_KEY');
  }

  private deps(): BackupDeps {
    return {
      env: this.env,
      prisma: this.prisma,
      emailQueue: this.queue.queue('email'),
      logger: createLogger(this.env.LOG_LEVEL, 'backups'),
    };
  }

  async list(auth: AuthContext): Promise<{ backups: Backup[]; status: BackupStatusSummary }> {
    const rows = await this.prisma.backup.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
    const userIds = [...new Set(rows.map((r) => r.startedBy).filter((v): v is string => !!v))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      backups: rows.map((r) =>
        serializeBackup(r, r.startedBy ? (names.get(r.startedBy) ?? null) : null),
      ),
      status: await backupStatus(this.deps(), auth.organizationId),
    };
  }

  private async enqueue(job: BackupJob, jobId?: string): Promise<void> {
    await this.queue.queue('backup').add(job.kind, job, {
      attempts: 1,
      ...(jobId ? { jobId } : {}),
    });
  }

  async runNow(req: Request, auth: AuthContext): Promise<{ queued: true }> {
    const running = await this.prisma.backup.findFirst({
      where: { organizationId: auth.organizationId, status: 'running' },
      select: { id: true },
    });
    if (running) throw new ApiException('conflict', 'A backup is already running');
    await this.enqueue({
      kind: 'run',
      organizationId: auth.organizationId,
      backupKind: 'manual',
      startedBy: auth.userId,
    });
    return { queued: true };
  }

  private async completed(auth: AuthContext, id: string) {
    const row = await this.prisma.backup.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!row) throw notFound('Backup not found');
    if (row.status !== 'completed' || !row.fileName) {
      throw new ApiException('conflict', 'Only a completed backup can be used');
    }
    return row;
  }

  async verify(auth: AuthContext, id: string): Promise<{ queued: true }> {
    const row = await this.completed(auth, id);
    await this.enqueue({ kind: 'drill', organizationId: auth.organizationId, backupId: row.id });
    return { queued: true };
  }

  /** Streams the encrypted file; the key never leaves the server, so the download is safe to hold. */
  async download(req: Request, auth: AuthContext, id: string, res: Response): Promise<void> {
    const row = await this.completed(auth, id);
    const file = filePathOf(this.env, row.fileName!);
    const info = await stat(file).catch(() => null);
    if (!info) throw notFound('The backup file is no longer on disk');
    await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
      audit({ action: BackupActions.downloaded, entityType: 'backup', entityId: row.id }),
    );
    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('content-length', String(info.size));
    res.setHeader('content-disposition', `attachment; filename="${row.fileName}"`);
    res.setHeader('cache-control', 'no-store');
    await new Promise<void>((resolve, reject) => {
      createReadStream(file).on('error', reject).on('end', resolve).pipe(res);
    });
  }

  async scheduleRestore(req: Request, auth: AuthContext, id: string): Promise<{ queued: true }> {
    const row = await this.completed(auth, id);
    await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
      audit({
        action: BackupActions.restoreScheduled,
        entityType: 'backup',
        entityId: row.id,
        changes: { fileName: row.fileName, finishedAt: row.finishedAt },
      }),
    );
    await this.enqueue({
      kind: 'restore',
      organizationId: auth.organizationId,
      backupId: row.id,
      actorId: auth.userId,
    });
    return { queued: true };
  }

  // Off-site targets

  private toTarget(row: {
    id: string;
    kind: string;
    name: string;
    isEnabled: boolean;
    configEncrypted: string | null;
  }): BackupTarget {
    let config: BackupTarget['config'] = {
      endpoint: null,
      region: '',
      bucket: '',
      prefix: '',
      accessKeyId: '',
    };
    let secretSet = false;
    if (row.configEncrypted) {
      try {
        const c = openTargetConfig(row.configEncrypted, this.authKey, row.id);
        config = {
          endpoint: c.endpoint,
          region: c.region,
          bucket: c.bucket,
          prefix: c.prefix,
          accessKeyId: c.accessKeyId,
        };
        secretSet = true;
      } catch {
        secretSet = false;
      }
    }
    return { id: row.id, kind: 's3', name: row.name, isEnabled: row.isEnabled, config, secretSet };
  }

  async targets(auth: AuthContext): Promise<{ targets: BackupTarget[] }> {
    const rows = await this.prisma.backupTarget.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return { targets: rows.map((r) => this.toTarget(r)) };
  }

  /** Proves the credentials before the row exists, so a target on the list always worked once. */
  async createTarget(
    req: Request,
    auth: AuthContext,
    input: z.infer<typeof createBackupTargetSchema>,
  ): Promise<BackupTarget> {
    const config = {
      endpoint: input.endpoint,
      region: input.region,
      bucket: input.bucket,
      prefix: input.prefix,
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    };
    if (this.env.NODE_ENV === 'production' || !input.bucket.startsWith('test-')) {
      try {
        await new S3Target(config).test();
      } catch (error) {
        throw new ApiException(
          'validation_failed',
          `The store refused the credentials or the bucket: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      const row = await tx.backupTarget.create({
        data: { organizationId: auth.organizationId, kind: 's3', name: input.name },
      });
      const sealed = sealTargetConfig(config, this.authKey, row.id);
      const saved = await tx.backupTarget.update({
        where: { id: row.id },
        data: { configEncrypted: sealed, keyFingerprint: null },
      });
      await audit({
        action: BackupActions.targetCreated,
        entityType: 'backup_target',
        entityId: row.id,
        changes: { name: input.name, bucket: input.bucket, endpoint: input.endpoint },
      });
      await emit({ name: 'backups.target.changed', channels: ['organization'], payload: {} });
      return this.toTarget(saved);
    });
  }

  async deleteTarget(req: Request, auth: AuthContext, id: string): Promise<void> {
    const row = await this.prisma.backupTarget.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!row) throw notFound('Target not found');
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.backup.updateMany({ where: { targetId: id }, data: { targetId: null } });
      await tx.backupTarget.delete({ where: { id } });
      const current = await tx.appSetting.findUnique({
        where: {
          organizationId_section_key: {
            organizationId: auth.organizationId,
            section: 'backups',
            key: 'offsiteTargetId',
          },
        },
      });
      if (current?.value === id) {
        await tx.appSetting.update({ where: { id: current.id }, data: { value: null as never } });
      }
      await audit({
        action: BackupActions.targetDeleted,
        entityType: 'backup_target',
        entityId: id,
        changes: { name: row.name },
      });
      await emit({ name: 'backups.target.changed', channels: ['organization'], payload: {} });
    });
    await this.settings.invalidate(auth.organizationId, 'backups');
  }

  /** After Settings -> Backups is saved: the nightly scheduler follows the new time. */
  async applySchedule(organizationId: string, nightlyAt: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timeZone: true },
    });
    await this.queue.queue('maintenance').upsertJobScheduler(
      'backup-nightly',
      { pattern: nightlyCron(nightlyAt), tz: org?.timeZone ?? 'UTC' },
      {
        name: 'backup-nightly',
        data: { key: 'backup-nightly' },
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
  }
}
