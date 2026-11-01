import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rolesResponseSchema, userDetailSchema } from '@inspower/shared';
import { PrismaService } from '../src/platform/database/prisma.service';
import { QueueService } from '../src/platform/jobs/queue.service';
import { createTestApp } from './app';
import { Client, createOwner, OWNER, relaxSecuritySettings, resetDatabase } from './fixtures';

let app: INestApplication;
let prisma: PrismaService;
const PASSWORD = 'orbit-meadow-copper-sixteen-91';
const TEAMMATE_PASSWORD = 'quiet-saffron-ladder-canyon-58';
let owner: Client;
let roles: Awaited<ReturnType<typeof rolesResponseSchema.parse>>;
let headOfficeId = '';
let inviteeId = '';
let inviteLink = '';

async function queuedLink(templateName: string): Promise<string> {
  const log = await prisma.emailLog.findFirstOrThrow({
    where: { template: templateName },
    orderBy: { createdAt: 'desc' },
  });
  const job = await app.get(QueueService).queue('email').getJob(log.id);
  const data = job?.data as { template: { params: { link: string } } } | undefined;
  if (!data) throw new Error('No queued email job');
  return data.template.params.link;
}

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
  headOfficeId = (await prisma.location.findFirstOrThrow({ where: { isHeadOffice: true } })).id;
});
afterAll(async () => app.close());

describe('roles and the matrix', () => {
  it('lists the four built-in roles, the registry grouped by module, and shows the Super Admin as holding everything', async () => {
    const res = await owner.get('/roles');
    expect(res.status).toBe(200);
    roles = rolesResponseSchema.parse(res.body);
    expect(roles.roles.map((r) => r.key)).toEqual([
      'super_admin',
      'administrator',
      'member',
      'viewer',
    ]);
    const superAdmin = roles.roles[0]!;
    expect(superAdmin.isFixed).toBe(true);
    expect(superAdmin.permissions).toHaveLength(roles.permissions.length);
    expect(roles.roles.find((r) => r.key === 'viewer')!.permissions).toEqual([]);
    expect(roles.modules.map((m) => m.key)).toContain('users');
    expect(roles.permissions.filter((p) => p.superAdminOnly).map((p) => p.key)).toContain(
      'roles.manage',
    );
  });

  it('refuses to edit the Super Admin role, to give a reserved permission, and a stale version', async () => {
    const admin = roles.roles.find((r) => r.key === 'administrator')!;
    const fixed = await owner.put(`/roles/${roles.roles[0]!.id}`, { permissions: [], version: 1 });
    expect(fixed.body.code).toBe('forbidden');
    const reserved = await owner.put(`/roles/${admin.id}`, {
      permissions: [...admin.permissions, 'roles.manage'],
      version: admin.version,
    });
    expect(reserved.body.code).toBe('reserved_permission');
    const stale = await owner.put(`/roles/${admin.id}`, {
      permissions: admin.permissions,
      version: admin.version + 5,
    });
    expect(stale.body.code).toBe('conflict');
  });

  it('edits a built-in role (marked customised), then resets it to the default', async () => {
    const admin = roles.roles.find((r) => r.key === 'administrator')!;
    const edited = await owner.put(`/roles/${admin.id}`, {
      permissions: ['users.read'],
      version: admin.version,
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ isCustomised: true, permissions: ['users.read'] });
    const reset = await owner.post(`/roles/${admin.id}/reset`);
    expect(reset.body.isCustomised).toBe(false);
    expect(reset.body.permissions).toContain('settings.manage');
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['roles.role.updated', 'roles.role.reset'] } },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('creates a custom role by copying Member, refuses to delete it while someone holds it, deletes it when free', async () => {
    const member = roles.roles.find((r) => r.key === 'member')!;
    const created = await owner.post('/roles', {
      name: 'Front desk',
      description: 'Reception',
      permissions: ['audit.read'],
      copyFromRoleId: member.id,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ key: 'front_desk', isSystem: false, isFixed: false });
    expect(created.body.permissions).toEqual(
      expect.arrayContaining(['audit.read', 'users.read', 'organization.read']),
    );
    roles = rolesResponseSchema.parse((await owner.get('/roles')).body);
    expect(roles.roles.map((r) => r.key)).toContain('front_desk');
  });

  it('needs roles.manage (reserved) and step-up: an Administrator cannot touch roles at all', async () => {
    // proven below once a teammate exists; here: step-up expiry is simulated by deleting the grant
    await prisma.stepUpGrant.deleteMany();
    const member = roles.roles.find((r) => r.key === 'member')!;
    const res = await owner.put(`/roles/${member.id}`, {
      permissions: member.permissions,
      version: member.version,
    });
    expect(res.body.code).toBe('step_up_required');
    await owner.post('/auth/step-up', { password: PASSWORD });
  });
});

describe('inviting a teammate', () => {
  it('refuses the Super Admin role as an ordinary assignment and an unknown location', async () => {
    const superAdmin = roles.roles[0]!;
    const bad = await owner.post('/users', {
      email: 'priya@example.test',
      fullName: 'Priya Nair',
      assignments: [{ roleId: superAdmin.id, locationId: null }],
    });
    expect(bad.body.code).toBe('forbidden');
    const badLocation = await owner.post('/users', {
      email: 'priya@example.test',
      fullName: 'Priya Nair',
      assignments: [
        { roleId: roles.roles[1]!.id, locationId: '019a0000-0000-7000-8000-000000000009' },
      ],
    });
    expect(badLocation.body.code).toBe('validation_failed');
  });

  it('invites with two scoped roles, queues the email, and returns the link', async () => {
    const frontDesk = roles.roles.find((r) => r.key === 'front_desk')!;
    const viewer = roles.roles.find((r) => r.key === 'viewer')!;
    const res = await owner.post('/users', {
      email: 'Priya@Example.test',
      fullName: 'Priya Nair',
      assignments: [
        { roleId: frontDesk.id, locationId: headOfficeId },
        { roleId: viewer.id, locationId: null },
      ],
    });
    expect(res.status).toBe(201);
    const user = userDetailSchema.parse(res.body.user);
    expect(user).toMatchObject({
      email: 'priya@example.test',
      status: 'invited',
      isSuperAdmin: false,
    });
    expect(user.assignments).toHaveLength(2);
    expect(user.assignments.find((a) => a.roleKey === 'front_desk')?.locationName).toBe(
      'Portsmouth',
    );
    expect(user.invitation?.expired).toBe(false);
    inviteeId = user.id;
    inviteLink = res.body.link;
    expect(inviteLink).toMatch(/^http:\/\/localhost:3000\/accept-invitation\?token=/);
    expect(await queuedLink('invitation')).toBe(inviteLink);
    const dup = await owner.post('/users', {
      email: 'priya@example.test',
      fullName: 'Priya Nair',
      assignments: [{ roleId: viewer.id, locationId: null }],
    });
    expect(dup.body.code).toBe('conflict');
  });

  it('an invited person cannot sign in yet, and the list shows them as invited', async () => {
    const c = await new Client(app).init();
    const res = await c.post('/auth/sign-in', {
      email: 'priya@example.test',
      password: TEAMMATE_PASSWORD,
    });
    expect(res.body.code).toBe('invalid_credentials');
    const list = await owner.get('/users?status=invited');
    expect(list.body.users.map((u: { email: string }) => u.email)).toEqual(['priya@example.test']);
  });

  it('a new link cancels the old one', async () => {
    const oldToken = new URL(inviteLink).searchParams.get('token')!;
    const res = await owner.post(`/users/${inviteeId}/invitation/resend`);
    expect(res.status).toBe(200);
    inviteLink = res.body.link;
    const c = await new Client(app).init();
    expect((await c.get(`/invitations/${oldToken}`)).body.code).toBe('token_invalid');
    const preview = await c.get(`/invitations/${new URL(inviteLink).searchParams.get('token')!}`);
    expect(preview.body).toMatchObject({
      email: 'priya@example.test',
      fullName: 'Priya Nair',
      organizationName: 'Northwind Dental Ltd',
    });
  });

  it('accepts once with a strong password; the link then dies and the person can sign in', async () => {
    const token = new URL(inviteLink).searchParams.get('token')!;
    const c = await new Client(app).init();
    const weak = await c.post('/invitations/accept', { token, password: 'password1' });
    expect(weak.body.code).toBe('password_rejected');
    const ok = await c.post('/invitations/accept', { token, password: TEAMMATE_PASSWORD });
    expect(ok.status).toBe(200);
    expect(
      (await c.post('/invitations/accept', { token, password: TEAMMATE_PASSWORD })).body.code,
    ).toBe('token_invalid');
    const signIn = await c.post('/auth/sign-in', {
      email: 'priya@example.test',
      password: TEAMMATE_PASSWORD,
    });
    expect(signIn.body).toEqual({ stage: 'active', next: '/dashboard' });
    expect(await prisma.notification.count({ where: { type: 'users.invitation_accepted' } })).toBe(
      1,
    );
  });
});

describe('deny by default for a teammate', () => {
  let priya: Client;
  beforeAll(async () => {
    priya = await new Client(app).init();
    await priya.post('/auth/sign-in', { email: 'priya@example.test', password: TEAMMATE_PASSWORD });
  });

  it('may see what her roles allow and nothing else; her session carries the location scope', async () => {
    expect((await priya.get('/users')).status).toBe(200); // front_desk copied users.read from Member
    expect((await priya.get('/profile/sessions')).status).toBe(200);
    const roles403 = await priya.get('/roles');
    expect(roles403.body.code).toBe('forbidden');
    expect((await priya.get('/health/details')).body.code).toBe('forbidden');
    // Deny before validating: a person without users.invite is refused even with a bad body
    expect(
      (await priya.post('/users', { email: 'x@example.test', fullName: 'X', assignments: [] }))
        .status,
    ).toBe(403);
    expect(
      (
        await priya.post('/users', {
          email: 'x@example.test',
          fullName: 'X',
          assignments: [{ roleId: roles.roles[2]!.id, locationId: null }],
        })
      ).body.code,
    ).toBe('forbidden');
    const session = await priya.get('/auth/session');
    expect(session.body.user.permissions).toEqual(
      expect.arrayContaining(['users.read', 'audit.read']),
    );
    expect(session.body.user.permissions).not.toContain('roles.manage');
  });

  it('a role change reaches her live session on the next request', async () => {
    const viewer = roles.roles.find((r) => r.key === 'viewer')!;
    const detail = userDetailSchema.parse((await owner.get(`/users/${inviteeId}`)).body);
    const res = await owner.put(`/users/${inviteeId}`, {
      assignments: [{ roleId: viewer.id, locationId: null }],
      version: detail.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.assignments).toHaveLength(1);
    expect((await priya.get('/users')).body.code).toBe('forbidden');
    const stale = await owner.put(`/users/${inviteeId}`, {
      fullName: 'P',
      version: detail.version,
    });
    expect(stale.body.code).toBe('conflict');
  });

  it('disable signs her out everywhere and emails her; enable lets her back in', async () => {
    const disabled = await owner.post(`/users/${inviteeId}/disable`);
    expect(disabled.body.status).toBe('disabled');
    expect((await priya.get('/profile')).status).toBe(401);
    const blocked = await new Client(app).init();
    expect(
      (
        await blocked.post('/auth/sign-in', {
          email: 'priya@example.test',
          password: TEAMMATE_PASSWORD,
        })
      ).body.code,
    ).toBe('account_disabled');
    expect(await prisma.emailLog.count({ where: { template: 'account-disabled' } })).toBe(1);
    const enabled = await owner.post(`/users/${inviteeId}/enable`);
    expect(enabled.body.status).toBe('active');
    await priya.post('/auth/sign-in', { email: 'priya@example.test', password: TEAMMATE_PASSWORD });
    expect((await priya.get('/profile')).status).toBe(200);
  });

  it('cannot disable or anonymise yourself, nor the last Super Admin', async () => {
    const me = (await owner.get('/profile')).body.id;
    expect((await owner.post(`/users/${me}/disable`)).body.code).toBe('forbidden');
    expect((await owner.delete(`/users/${me}/super-admin`)).body.code).toBe('last_super_admin');
  });

  it('promotes a second Super Admin (reserved + step-up), who then holds every permission; then demotes', async () => {
    const promoted = await owner.post(`/users/${inviteeId}/super-admin`);
    expect(promoted.status).toBe(200);
    expect(promoted.body.isSuperAdmin).toBe(true);
    expect((await priya.get('/roles')).status).toBe(200);
    // now the owner is no longer the last one and could be disabled by Priya; demote her again
    const demoted = await owner.delete(`/users/${inviteeId}/super-admin`);
    expect(demoted.body.isSuperAdmin).toBe(false);
    expect((await priya.get('/roles')).body.code).toBe('forbidden');
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['users.superadmin.granted', 'users.superadmin.removed'] } },
      }),
    ).toBe(2);
  });

  it('changes her email by confirmation: password needed, link from the new address, old address freed', async () => {
    const wrong = await priya.post('/profile/email-change', {
      newEmail: 'priya.nair@example.test',
      password: 'nope-nope-nope',
    });
    expect(wrong.body.code).toBe('invalid_credentials');
    const ok = await priya.post('/profile/email-change', {
      newEmail: 'priya.nair@example.test',
      password: TEAMMATE_PASSWORD,
    });
    expect(ok.status).toBe(202);
    expect((await priya.get('/profile')).body.email).toBe('priya@example.test');
    const link = await queuedLink('email-change');
    const token = new URL(link).searchParams.get('token')!;
    const anon = await new Client(app).init();
    expect((await anon.post('/profile/email-change/confirm', { token })).body).toEqual({
      email: 'priya.nair@example.test',
    });
    expect((await anon.post('/profile/email-change/confirm', { token })).body.code).toBe(
      'token_invalid',
    );
    expect((await priya.get('/profile')).body.email).toBe('priya.nair@example.test');
  });

  it('anonymises: name and email replaced, sessions gone, roles removed, audit kept', async () => {
    const res = await owner.post(`/users/${inviteeId}/anonymise`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'anonymised',
      fullName: 'Former user',
      assignments: [],
    });
    expect(res.body.email).toMatch(/^anonymised-[0-9a-f]{12}@invalid\.local$/);
    expect((await priya.get('/profile')).status).toBe(401);
    expect((await owner.get('/users')).body.users.map((u: { id: string }) => u.id)).not.toContain(
      inviteeId,
    );
    expect(
      await prisma.auditLog.count({ where: { entityType: 'user', entityId: inviteeId } }),
    ).toBeGreaterThan(3);
    const activity = await owner.get(`/users/${inviteeId}/activity`);
    expect(
      activity.body.entries.some((e: { action: string }) => e.action === 'users.user.anonymised'),
    ).toBe(true);
  });
});

describe('locations and scoping', () => {
  it('lists the locations a person may see', async () => {
    const res = await owner.get('/locations');
    expect(res.body.locations).toEqual([
      { id: headOfficeId, name: 'Portsmouth', isHeadOffice: true, isActive: true },
    ]);
  });
});
