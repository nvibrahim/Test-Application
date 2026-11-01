import { stat } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupsResponseSchema, backupTargetsResponseSchema } from '@inspower/shared';
import { ENV } from '../src/platform/config/config.module';
import type { Env } from '../src/platform/config/config';
import { PrismaService } from '../src/platform/database/prisma.service';
import { QueueService } from '../src/platform/jobs/queue.service';
import { createLogger } from '../src/platform/logging/logger';
import {
  applyRetention,
  backupStatus,
  filePathOf,
  readManifest,
  runBackup,
  runDrill,
  verifyBackup,
  type BackupDeps,
} from '../src/modules/backups/engine';
import { createTestApp } from './app';
import { Client, createOwner, OWNER, relaxSecuritySettings, resetDatabase } from './fixtures';

let app: INestApplication;
let prisma: PrismaService;
let deps: BackupDeps;
let orgId = '';
const PASSWORD = 'harbour-velvet-nineteen-pine-07';
const MEMBER_PASSWORD = 'canvas-ember-lantern-tide-33';
let owner: Client;
let member: Client;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await resetDatabase(app, prisma);
  await createOwner();
  await relaxSecuritySettings(prisma);
  owner = await new Client(app).init();
  await owner.post('/auth/sign-in', { email: OWNER.email, password: OWNER.tempPassword });
  await owner.post('/auth/password/change', {
    currentPassword: OWNER.tempPassword,
    newPassword: PASSWORD,
  });
  await owner.post('/setup/organization', {
    legalName: 'Northwind Dental Ltd',
    countryCode: 'GB',
    currencyCode: 'GBP',
    timeZone: 'Europe/London',
    headOffice: { name: 'Portsmouth' },
  });
  await owner.post('/auth/step-up', { password: PASSWORD });
  const roles = (await owner.get('/roles')).body.roles as { id: string; key: string }[];
  const invite = await owner.post('/users', {
    email: 'ada@example.test',
    fullName: 'Ada Admin',
    assignments: [{ roleId: roles.find((r) => r.key === 'administrator')!.id, locationId: null }],
  });
  const token = new URL(invite.body.link).searchParams.get('token')!;
  member = await new Client(app).init();
  await member.post('/invitations/accept', { token, password: MEMBER_PASSWORD });
  await member.post('/auth/sign-in', { email: 'ada@example.test', password: MEMBER_PASSWORD });
  await member.post('/auth/step-up', { password: MEMBER_PASSWORD });
  const org = await prisma.organization.findFirstOrThrow();
  orgId = org.id;
  const env = app.get<Env>(ENV);
  deps = {
    env,
    prisma,
    emailQueue: app.get(QueueService).queue('email'),
    logger: createLogger('silent', 'test'),
  };
});
afterAll(async () => app.close());

describe('backup engine against the real database', () => {
  it('takes an encrypted backup with a manifest, verifies it and restores it into a scratch database', async () => {
    const { id, fileName } = await runBackup(deps, { organizationId: orgId, kind: 'manual' });
    const row = await prisma.backup.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('completed');
    expect(Number(row.sizeBytes)).toBeGreaterThan(1000);
    expect(row.migrationId).toMatch(/^2026/);
    const manifest = await readManifest(deps.env, fileName);
    expect(manifest?.checksum).toBe(row.checksum);
    expect(manifest?.rowCounts['users']).toBe(2);
    expect((await stat(filePathOf(deps.env, fileName))).mode & 0o077).toBe(0);

    await verifyBackup(deps, id);
    const drill = await runDrill(deps, orgId, id);
    expect(drill).toMatch(/tables matched/);
    const after = await prisma.backup.findUniqueOrThrow({ where: { id } });
    expect(after.restoreTestedAt).not.toBeNull();
    const scratch = await prisma.$queryRaw<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE '%_drill'`;
    expect(scratch[0]?.n).toBe(0);

    const status = await backupStatus(deps, orgId);
    expect(status.lastSuccessAt).not.toBeNull();
    expect(status.lastDrillPassed).toBe(true);
    expect(status.missed).toBe(false);
    expect(status.keyFingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('retention keeps the newest daily backups and removes the rest with their files', async () => {
    const files: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await runBackup(deps, { organizationId: orgId, kind: 'scheduled' });
      files.push(r.fileName);
      await prisma.backup.update({
        where: { id: r.id },
        data: { finishedAt: new Date(Date.now() - (i + 40) * 86_400_000) },
      });
    }
    await prisma.appSetting.upsert({
      where: {
        organizationId_section_key: { organizationId: orgId, section: 'backups', key: 'retention' },
      },
      update: { value: { daily: 1, weekly: 0, monthly: 0 } },
      create: {
        organizationId: orgId,
        section: 'backups',
        key: 'retention',
        value: { daily: 1, weekly: 0, monthly: 0 },
      },
    });
    const result = await applyRetention(deps, orgId);
    expect(result).toMatch(/^Removed 3 of 4/);
    for (const f of files) {
      await expect(stat(filePathOf(deps.env, f))).rejects.toThrow();
    }
    expect(
      await prisma.backup.count({ where: { organizationId: orgId, status: 'completed' } }),
    ).toBe(1);
    await prisma.appSetting.deleteMany({ where: { organizationId: orgId, section: 'backups' } });
  });
});

describe('backup endpoints', () => {
  it('lists backups and status for backups.read, queues Back up now behind step-up, refuses the rest', async () => {
    const list = await owner.get('/backups');
    expect(list.status).toBe(200);
    const parsed = backupsResponseSchema.parse(list.body);
    expect(parsed.backups.length).toBeGreaterThan(0);
    expect(parsed.status.localDir).toContain('backups');

    const queued = await owner.post('/backups');
    expect(queued.status).toBe(202);
    const job = await app
      .get(QueueService)
      .queue('backup')
      .getJobs(['waiting', 'delayed', 'active']);
    expect(job.some((j) => j.data.kind === 'run')).toBe(true);
    await Promise.all(job.map((j) => j.remove()));

    // an Administrator may read and run, but restore is reserved to the Super Admin
    expect((await member.get('/backups')).status).toBe(200);
    const id = parsed.backups.find((b) => b.status === 'completed')!.id;
    expect((await member.post(`/backups/${id}/restore`, { confirmation: 'RESTORE' })).status).toBe(
      403,
    );
    expect((await owner.post(`/backups/${id}/restore`, { confirmation: 'restore' })).status).toBe(
      400,
    );
    const restore = await owner.post(`/backups/${id}/restore`, { confirmation: 'RESTORE' });
    expect(restore.status).toBe(202);
    const jobs = await app
      .get(QueueService)
      .queue('backup')
      .getJobs(['waiting', 'delayed', 'active']);
    expect(jobs.some((j) => j.data.kind === 'restore')).toBe(true);
    await Promise.all(jobs.map((j) => j.remove()));
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'backups.restore.scheduled', entityId: id },
    });
    expect(audit).not.toBeNull();
  });

  it('downloads the encrypted file with an audit row', async () => {
    const list = backupsResponseSchema.parse((await owner.get('/backups')).body);
    const done = list.backups.find((b) => b.status === 'completed')!;
    const res = await owner.agent
      .get(`/api/v1/backups/${done.id}/download`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain(done.fileName);
    expect((res.body as Buffer).length).toBe(done.sizeBytes);
    expect((res.body as Buffer).subarray(0, 8).toString('ascii')).toBe('INSPBK01');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'backups.backup.downloaded', entityId: done.id },
    });
    expect(audit).not.toBeNull();
  });

  it('stores an off-site target sealed, never returns the secret, and clears the setting on delete', async () => {
    const created = await owner.post('/backups/targets', {
      name: 'Backblaze',
      endpoint: 'https://s3.eu-central-003.backblazeb2.com',
      region: 'eu-central-003',
      bucket: 'test-inspower-backups',
      prefix: 'northwind',
      accessKeyId: 'KEY',
      secretAccessKey: 'SECRET',
    });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain('SECRET');
    expect(created.body.secretSet).toBe(true);
    const row = await prisma.backupTarget.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.configEncrypted).not.toContain('SECRET');

    const listed = backupTargetsResponseSchema.parse((await owner.get('/backups/targets')).body);
    expect(listed.targets).toHaveLength(1);

    const saved = await owner.put('/settings/backups', {
      nightlyAt: '03:15',
      offsiteTargetId: created.body.id,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.value.offsiteTargetId).toBe(created.body.id);
    const status = backupsResponseSchema.parse((await owner.get('/backups')).body).status;
    expect(status.offsiteTarget).toBe('Backblaze');

    expect((await owner.delete(`/backups/targets/${created.body.id}`)).status).toBe(204);
    const settings = await owner.get('/settings/backups');
    expect(settings.body.value.offsiteTargetId).toBeNull();
  });
});
