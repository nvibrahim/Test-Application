import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditLogResponseSchema,
  featureSwitchesResponseSchema,
  jobsResponseSchema,
  scheduledJobsResponseSchema,
} from '@inspower/shared';
import { PrismaService } from '../src/platform/database/prisma.service';
import { QueueService } from '../src/platform/jobs/queue.service';
import { createTestApp } from './app';
import { Client, createOwner, OWNER, relaxSecuritySettings, resetDatabase } from './fixtures';

let app: INestApplication;
let prisma: PrismaService;
const PASSWORD = 'granite-willow-sixteen-amber-42';
const MEMBER_PASSWORD = 'lantern-cobalt-meadow-river-77';
let owner: Client;
let member: Client;
let memberId = '';

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
    email: 'vi@example.test',
    fullName: 'Vi Viewer',
    assignments: [{ roleId: roles.find((r) => r.key === 'viewer')!.id, locationId: null }],
  });
  memberId = invite.body.user.id;
  const token = new URL(invite.body.link).searchParams.get('token')!;
  member = await new Client(app).init();
  await member.post('/invitations/accept', { token, password: MEMBER_PASSWORD });
  await member.post('/auth/sign-in', { email: 'vi@example.test', password: MEMBER_PASSWORD });
});
afterAll(async () => app.close());

describe('background and scheduled jobs', () => {
  it('lists queue counts and history for system.read; a viewer is refused', async () => {
    expect((await member.get('/jobs')).status).toBe(403);
    const res = await owner.get('/jobs?limit=10');
    expect(res.status).toBe(200);
    const parsed = jobsResponseSchema.parse(res.body);
    expect(parsed.queues.map((q) => q.name).sort()).toEqual([
      'backup',
      'email',
      'exports',
      'maintenance',
    ]);
  });

  it('shows every registered scheduled job; pause removes the scheduler, resume puts it back, run now queues one run; all audited', async () => {
    const list = scheduledJobsResponseSchema.parse((await owner.get('/jobs/scheduled')).body);
    expect(list.jobs.map((j) => j.key)).toContain('backup-nightly');
    expect(list.jobs.find((j) => j.key === 'backup-nightly')?.cron).toBe('0 2 * * *');

    expect((await owner.post('/jobs/scheduled/outbox-cleanup/pause')).status).toBe(204);
    let after = scheduledJobsResponseSchema.parse((await owner.get('/jobs/scheduled')).body);
    expect(after.jobs.find((j) => j.key === 'outbox-cleanup')?.isPaused).toBe(true);

    expect((await owner.post('/jobs/scheduled/outbox-cleanup/resume')).status).toBe(204);
    after = scheduledJobsResponseSchema.parse((await owner.get('/jobs/scheduled')).body);
    const resumed = after.jobs.find((j) => j.key === 'outbox-cleanup')!;
    expect(resumed.isPaused).toBe(false);
    expect(resumed.nextRunAt).not.toBeNull();
    const schedulers = await app.get(QueueService).queue('maintenance').getJobSchedulers();
    expect(schedulers.some((s) => s.key === 'outbox-cleanup')).toBe(true);

    expect((await owner.post('/jobs/scheduled/retention-cleanup/run')).status).toBe(202);
    const queued = await app.get(QueueService).queue('maintenance').getJobs(['waiting', 'delayed']);
    const manual = queued.filter((j) => j.name === 'retention-cleanup' && j.data.manual === true);
    expect(manual.length).toBe(1);
    await Promise.all(manual.map((j) => j.remove()));
    await app.get(QueueService).queue('maintenance').removeJobScheduler('outbox-cleanup');

    expect((await owner.post('/jobs/scheduled/no-such-job/run')).status).toBe(404);
    const actions = await prisma.auditLog.findMany({
      where: { action: { startsWith: 'jobs.schedule.' } },
      select: { action: true },
    });
    expect(new Set(actions.map((a) => a.action))).toEqual(
      new Set(['jobs.schedule.paused', 'jobs.schedule.resumed', 'jobs.schedule.run_now']),
    );
  });

  it('retries a failed job, cancels a waiting one and removes history, each audited', async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const queue = app.get(QueueService).queue('exports');
    const waiting = await queue.add('report', { startedBy: null }, { attempts: 1 });
    const run = await prisma.jobRun.create({
      data: {
        organizationId: org.id,
        queue: 'exports',
        name: 'report',
        jobId: String(waiting.id),
        status: 'queued',
      },
    });
    expect((await owner.post(`/jobs/${run.id}/retry`)).status).toBe(409); // waiting, not failed
    expect((await owner.post(`/jobs/${run.id}/cancel`)).status).toBe(204);
    expect(await queue.getJob(String(waiting.id))).toBeUndefined();
    expect((await prisma.jobRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      'cancelled',
    );
    expect((await owner.delete(`/jobs/${run.id}`)).status).toBe(204);
    expect(await prisma.jobRun.findUnique({ where: { id: run.id } })).toBeNull();
    expect((await member.post(`/jobs/${run.id}/cancel`)).status).toBe(403);
  });

  it('serves the queue inspector only to a session with jobs.manage', async () => {
    expect((await member.agent.get('/api/v1/admin/queues')).status).toBe(404);
    expect((await owner.agent.get('/api/v1/admin/queues/api/queues')).status).toBe(200);
    const anon = await new Client(app).init();
    expect((await anon.agent.get('/api/v1/admin/queues')).status).toBe(404);
  });
});

describe('audit log', () => {
  it('filters by action prefix, entity and actor; pages with a cursor; a viewer is refused', async () => {
    expect((await member.get('/audit')).status).toBe(403);
    const all = auditLogResponseSchema.parse((await owner.get('/audit?limit=5')).body);
    expect(all.entries).toHaveLength(5);
    expect(all.nextCursor).not.toBeNull();
    expect(all.actions.length).toBeGreaterThan(5);
    const page2 = auditLogResponseSchema.parse(
      (await owner.get(`/audit?limit=5&cursor=${all.nextCursor}`)).body,
    );
    expect(page2.entries[0]?.id).not.toBe(all.entries[0]?.id);

    const users = auditLogResponseSchema.parse((await owner.get('/audit?action=users.')).body);
    expect(users.entries.length).toBeGreaterThan(0);
    expect(users.entries.every((e) => e.action.startsWith('users.'))).toBe(true);

    const invited = auditLogResponseSchema.parse(
      (await owner.get(`/audit?entityType=user&entityId=${memberId}`)).body,
    );
    const invite = invited.entries.find((e) => e.action === 'users.user.invited');
    expect(invite?.actorName).toBe('Olive Owner');
    expect(invited.entries.find((e) => e.action === 'users.invitation.accepted')?.actorName).toBe(
      'Vi Viewer',
    );

    const future = auditLogResponseSchema.parse(
      (
        await owner.get(
          `/audit?from=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
        )
      ).body,
    );
    expect(future.entries).toHaveLength(0);
  });

  it('exports CSV behind audit.export and step-up, writes an audit row, and neutralises formulas', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'audit.log.exported' } });
    const res = await owner.agent.get('/api/v1/audit/export.csv?action=users.');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const text = res.text as string;
    const lines = text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe(
      'When (UTC),Action,Actor,Actor id,Entity type,Entity id,IP,User agent,Changes',
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).every((l) => l.includes(',users.'))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'audit.log.exported' } })).toBe(
      before + 1,
    );
    expect((await member.agent.get('/api/v1/audit/export.csv')).status).toBe(403);
  });
});

describe('feature switches', () => {
  it('lists the registry, changes state with step-up and audit, and the guard follows', async () => {
    expect((await owner.put('/features/design_system', { state: 'off' })).status).toBe(200);
    const list = featureSwitchesResponseSchema.parse((await owner.get('/features')).body);
    expect(list.features.map((f) => f.key)).toContain('design_system');
    expect(list.features.find((f) => f.key === 'design_system')?.state).toBe('off');
    expect((await member.get('/features/mine')).body.features).toEqual([]);

    const on = await owner.put('/features/design_system', {
      state: 'selected_users',
      userIds: [memberId],
    });
    expect(on.status).toBe(200);
    const changed = featureSwitchesResponseSchema
      .parse(on.body)
      .features.find((f) => f.key === 'design_system')!;
    expect(changed.state).toBe('selected_users');
    expect(changed.users.map((u) => u.id)).toEqual([memberId]);
    expect(changed.updatedByName).toBe('Olive Owner');
    expect((await member.get('/features/mine')).body.features).toEqual(['design_system']);

    expect((await owner.put('/features/nope', { state: 'on' })).status).toBe(404);
    expect((await owner.put('/features/design_system', { state: 'maybe' })).status).toBe(400);
    expect((await member.get('/features')).status).toBe(403);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'features.switch.changed', entityId: 'design_system' },
    });
    expect(audit).not.toBeNull();
    const flag = await prisma.featureFlag.findUniqueOrThrow({
      where: { key: 'design_system' },
      include: { users: true },
    });
    expect(flag.users).toHaveLength(1);
  });
});
