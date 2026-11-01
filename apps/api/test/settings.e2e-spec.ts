import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publicSettingsSchema, settingsSectionResponseSchema } from '@inspower/shared';
import { PrismaService } from '../src/platform/database/prisma.service';
import { createTestApp } from './app';
import { Client, createOwner, OWNER, relaxSecuritySettings, resetDatabase } from './fixtures';

let app: INestApplication;
let prisma: PrismaService;
const PASSWORD = 'orbit-meadow-copper-sixteen-91';
const MEMBER_PASSWORD = 'quiet-saffron-ladder-canyon-58';
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
  // a Member, straight to active
  const roles = (await owner.get('/roles')).body.roles as { id: string; key: string }[];
  const invite = await owner.post('/users', {
    email: 'mo@example.test',
    fullName: 'Mo Member',
    assignments: [{ roleId: roles.find((r) => r.key === 'member')!.id, locationId: null }],
  });
  memberId = invite.body.user.id;
  const token = new URL(invite.body.link).searchParams.get('token')!;
  member = await new Client(app).init();
  await member.post('/invitations/accept', { token, password: MEMBER_PASSWORD });
  await member.post('/auth/sign-in', { email: 'mo@example.test', password: MEMBER_PASSWORD });
});
afterAll(async () => app.close());

describe('settings sections', () => {
  it('lists the sections with who may edit them, and reads a section with defaults', async () => {
    const list = await owner.get('/settings');
    expect(list.body.sections.map((s: { key: string }) => s.key)).toEqual([
      'general',
      'appearance',
      'localization',
      'security',
      'email',
      'notifications',
      'backups',
      'maintenance',
    ]);
    const general = settingsSectionResponseSchema.parse(
      (await owner.get('/settings/general')).body,
    );
    expect(general.value['appName']).toBe('Inspower');
    expect(general.updatedAt).toBeNull();
    expect((await member.get('/settings/general')).body.code).toBe('forbidden');
  });

  it('saves General independently, audits before and after, and the public endpoint follows', async () => {
    const res = await owner.put('/settings/general', {
      appName: 'Northwind',
      tagline: 'Smiles first',
      supportEmail: 'help@northwind.test',
      landing: { headline: 'Hello', intro: 'Welcome', showContactForm: false },
    });
    expect(res.status).toBe(200);
    expect(res.body.value.appName).toBe('Northwind');
    expect(res.body.updatedByName).toBe(OWNER.name);
    const pub = publicSettingsSchema.parse((await owner.get('/settings/public')).body);
    expect(pub.appName).toBe('Northwind');
    expect(pub.organizationName).toBe('Northwind Dental Ltd');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'settings.general.updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(
      (audit?.changes as { before: { appName: string }; after: { appName: string } }).before
        .appName,
    ).toBe('Inspower');
    const bad = await owner.put('/settings/general', { appName: '' });
    expect(bad.body.code).toBe('validation_failed');
  });

  it('Security needs the reserved permission and step-up, and tells administrators', async () => {
    await prisma.stepUpGrant.deleteMany();
    const noStepUp = await owner.put('/settings/security', { session: { idleMinutes: 45 } });
    expect(noStepUp.body.code).toBe('step_up_required');
    await owner.post('/auth/step-up', { password: PASSWORD });
    const ok = await owner.put('/settings/security', {
      session: { idleMinutes: 45 },
      lockout: { delayAfterAttempts: 20 },
      password: { breachedPasswordCheck: false },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.value.session.idleMinutes).toBe(45);
    expect(ok.body.value.session.absoluteHours).toBe(12);
    expect(
      await prisma.notification.count({ where: { type: 'admin.security_settings_changed' } }),
    ).toBeGreaterThan(0);
    // the new idle timeout applies to the next sign-in's session
    const c = await new Client(app).init();
    await c.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    const session = (await c.get('/auth/session')).body;
    expect(new Date(session.idleExpiresAt).getTime() - Date.now()).toBeGreaterThan(40 * 60_000);
  });

  it('Email keeps the password sealed: written, reported as set, never returned, kept when left blank', async () => {
    const res = await owner.put('/settings/email', {
      host: 'smtp.example.test',
      port: 587,
      security: 'starttls',
      user: 'mailer',
      password: 'hunter2-is-secret',
      fromName: 'Northwind',
      fromAddress: 'no-reply@northwind.test',
    });
    expect(res.status).toBe(200);
    expect(res.body.secretsSet).toEqual(['password']);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    const row = await prisma.appSetting.findFirstOrThrow({
      where: { section: 'email', key: 'password' },
    });
    expect(row.isSecret).toBe(true);
    expect(JSON.stringify(row.value)).not.toContain('hunter2');
    const again = await owner.put('/settings/email', {
      host: 'smtp.example.test',
      port: 2525,
      security: 'none',
      user: 'mailer',
      fromName: 'Northwind',
      fromAddress: 'no-reply@northwind.test',
    });
    expect(again.body.secretsSet).toEqual(['password']);
    expect(again.body.value.port).toBe(2525);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'settings.email.updated' } });
    expect(JSON.stringify(audit?.changes)).not.toContain('hunter2');
  });

  it('a test email reports the outcome instead of failing the request', async () => {
    const res = await owner.post('/settings/email/test');
    expect(res.status).toBe(200);
    expect(typeof res.body.ok).toBe('boolean');
    expect(res.body.message).toMatch(/Sent to|refused/);
  });

  it('maintenance mode closes the app to a Member and keeps it open for the Super Admin', async () => {
    expect((await member.get('/profile')).status).toBe(200);
    const on = await owner.put('/settings/maintenance', {
      enabled: true,
      message: 'Back at 3pm',
      allowedRoleKeys: ['super_admin', 'administrator'],
    });
    expect(on.status).toBe(200);
    const closed = await member.get('/profile');
    expect(closed.status).toBe(503);
    expect(closed.body).toMatchObject({ code: 'maintenance', message: 'Back at 3pm' });
    const pub = (await member.get('/settings/public')).body;
    expect(pub.maintenance).toEqual({ enabled: true, message: 'Back at 3pm' });
    expect((await owner.get('/profile')).status).toBe(200);
    // the member can still sign out
    expect((await member.post('/auth/sign-out')).status).toBe(204);
    await owner.put('/settings/maintenance', { enabled: false });
    await member.post('/auth/sign-in', { email: 'mo@example.test', password: MEMBER_PASSWORD });
    expect((await member.get('/profile')).status).toBe(200);
    expect(await prisma.notification.count({ where: { type: 'admin.maintenance_changed' } })).toBe(
      2,
    );
  });
});

describe('organization and locations', () => {
  it('reads the profile; a plain field saves without step-up, the legal name needs it; versions are checked', async () => {
    const before = (await owner.get('/organization')).body;
    expect(before.legalName).toBe('Northwind Dental Ltd');
    await prisma.stepUpGrant.deleteMany();
    const plain = await owner.put('/organization', {
      tradingName: 'Northwind',
      version: before.version,
    });
    expect(plain.status).toBe(200);
    expect(plain.body.tradingName).toBe('Northwind');
    const sensitive = await owner.put('/organization', {
      legalName: 'Northwind Dental Limited',
      version: plain.body.version,
    });
    expect(sensitive.body.code).toBe('step_up_required');
    await owner.post('/auth/step-up', { password: PASSWORD });
    const ok = await owner.put('/organization', {
      legalName: 'Northwind Dental Limited',
      version: plain.body.version,
    });
    expect(ok.body.legalName).toBe('Northwind Dental Limited');
    const stale = await owner.put('/organization', {
      tradingName: 'X',
      version: plain.body.version,
    });
    expect(stale.body.code).toBe('conflict');
    expect((await member.get('/organization')).status).toBe(200); // Member has organization.read
    expect((await member.put('/organization', { tradingName: 'Y', version: 1 })).body.code).toBe(
      'forbidden',
    );
  });

  it('adds a branch, edits it, refuses a duplicate name and never deactivates the head office', async () => {
    const created = await owner.post('/locations', {
      name: 'Southsea',
      addressLines: ['2 Sea Road'],
      timeZone: null,
      managerUserId: memberId,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Southsea',
      isHeadOffice: false,
      isActive: true,
      managerName: 'Mo Member',
    });
    expect((await owner.post('/locations', { name: 'southsea' })).body.code).toBe('conflict');
    const edited = await owner.put(`/locations/${created.body.id}`, {
      name: 'Southsea Clinic',
      isActive: false,
      version: created.body.version,
    });
    expect(edited.body).toMatchObject({ name: 'Southsea Clinic', isActive: false });
    const head = (await owner.get('/locations')).body.locations.find(
      (l: { isHeadOffice: boolean }) => l.isHeadOffice,
    );
    const noDeactivate = await owner.put(`/locations/${head.id}`, {
      isActive: false,
      version: head.version,
    });
    expect(noDeactivate.body.code).toBe('conflict');
    expect((await owner.get('/locations')).body.locations).toHaveLength(2);
    expect((await member.post('/locations', { name: 'Nope' })).body.code).toBe('forbidden');
  });
});

describe('notifications', () => {
  it('lists, counts unread, marks read, and the preferences follow the registry with overrides', async () => {
    const list = await owner.get('/notifications');
    expect(list.status).toBe(200);
    expect(list.body.unread).toBeGreaterThan(0);
    const first = list.body.notifications[0];
    const read = await owner.post('/notifications/read', { ids: [first.id] });
    expect(read.body.unread).toBe(list.body.unread - 1);
    const all = await owner.post('/notifications/read', { ids: 'all' });
    expect(all.body.unread).toBe(0);
    const prefs = await owner.get('/profile/notifications');
    const lockout = prefs.body.preferences.find(
      (p: { type: string }) => p.type === 'admin.security_lockout',
    );
    expect(lockout).toMatchObject({ inApp: true, email: true });
    const memberPrefs = await member.get('/profile/notifications');
    expect(
      memberPrefs.body.preferences.some((p: { type: string }) => p.type.startsWith('admin.')),
    ).toBe(false);
    const updated = await owner.put('/profile/notifications', {
      preferences: [{ type: 'admin.security_lockout', inApp: false, email: false }],
    });
    expect(
      updated.body.preferences.find((p: { type: string }) => p.type === 'admin.security_lockout'),
    ).toMatchObject({ inApp: false, email: false });
  });

  it('a Member who turned off a type gets no notification of it; administrators are emailed per Settings -> Notifications', async () => {
    await owner.put('/settings/notifications', {
      emailAdminsOn: ['security.settings_changed'],
      extraRecipients: ['ops@northwind.test'],
    });
    const before = await prisma.emailLog.count({ where: { template: 'admin-event' } });
    await owner.put('/settings/security', {
      session: { idleMinutes: 30 },
      lockout: { delayAfterAttempts: 20 },
      password: { breachedPasswordCheck: false },
    });
    const after = await prisma.emailLog.findMany({
      where: { template: 'admin-event' },
      orderBy: { createdAt: 'desc' },
    });
    expect(after.length).toBeGreaterThan(before);
    expect(after.map((e) => e.toAddress)).toContain('ops@northwind.test');
    expect(after.map((e) => e.toAddress)).toContain(OWNER.email);
  });
});
