import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionInfoSchema } from '@inspower/shared';
import { PrismaService } from '../src/platform/database/prisma.service';
import { createTestApp } from './app';
import {
  Client,
  createOwner,
  OWNER,
  relaxSecuritySettings,
  resetDatabase,
  resetLinkFor,
} from './fixtures';

let app: INestApplication;
let prisma: PrismaService;
const STRONG = 'orbit-meadow-copper-sixteen-91';
const STRONGER = 'velvet-harbour-quartz-lemon-77';

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await resetDatabase(app, prisma);
  await createOwner();
  await relaxSecuritySettings(prisma);
});
afterAll(async () => app.close());

describe('before anyone signs in', () => {
  it('refuses a write without the CSRF header, and one from another origin', async () => {
    const c = await new Client(app).init();
    const noHeader = await c.postRaw('/auth/sign-in', { email: OWNER.email, password: 'x' });
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.code).toBe('csrf_failed');
    const other = await new Client(app, 'https://evil.example').init();
    const wrongOrigin = await other.post('/auth/sign-in', { email: OWNER.email, password: 'x' });
    expect(wrongOrigin.body.code).toBe('csrf_failed');
  });

  it('refuses a signed-in route with no cookie', async () => {
    const c = await new Client(app).init();
    const res = await c.get('/profile');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthenticated');
  });

  it('answers unknown emails and wrong passwords the same way, and records both', async () => {
    const c = await new Client(app).init();
    const unknown = await c.post('/auth/sign-in', {
      email: 'nobody@example.test',
      password: 'whatever-123',
    });
    const wrong = await c.post('/auth/sign-in', { email: OWNER.email, password: 'whatever-123' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toMatchObject({
      code: 'invalid_credentials',
      message: wrong.body.message,
    });
    const attempts = await prisma.loginAttempt.findMany({
      where: { succeeded: false },
      orderBy: { createdAt: 'asc' },
    });
    expect(attempts.map((a) => a.reason)).toEqual(['unknown_email', 'wrong_password']);
  });

  it('validates the body with the shared schema', async () => {
    const c = await new Client(app).init();
    const res = await c.post('/auth/sign-in', { email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('the owner signs in for the first time', () => {
  let c: Client;
  beforeAll(() => {
    c = new Client(app);
  });

  it('lands in the change_password stage with the temporary password', async () => {
    await c.init();
    const res = await c.post('/auth/sign-in', { email: OWNER.email, password: OWNER.tempPassword });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ stage: 'change_password', next: '/change-password' });
    expect(String(res.headers['set-cookie'])).toMatch(/inspower_session=.*HttpOnly/);
    const session = sessionInfoSchema.parse((await c.get('/auth/session')).body);
    expect(session.stage).toBe('change_password');
    expect(session.user.isSuperAdmin).toBe(true);
    expect(session.user.mustChangePassword).toBe(true);
  });

  it('cannot reach an active-only route in that stage', async () => {
    const res = await c.get('/profile');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('wrong_stage');
  });

  it('refuses a weak new password, a reused one, and a wrong current one', async () => {
    const weak = await c.post('/auth/password/change', {
      currentPassword: OWNER.tempPassword,
      newPassword: 'Summer2026',
    });
    expect(weak.status).toBe(422);
    expect(weak.body.code).toBe('password_rejected');
    expect(weak.body.details.problems.length).toBeGreaterThan(0);
    const reused = await c.post('/auth/password/change', {
      currentPassword: OWNER.tempPassword,
      newPassword: OWNER.tempPassword,
    });
    expect(reused.body.details.problems.join(' ')).toMatch(/used this password before/);
    const wrongCurrent = await c.post('/auth/password/change', {
      currentPassword: 'nope-nope-nope',
      newPassword: STRONG,
    });
    expect(wrongCurrent.body.code).toBe('invalid_credentials');
  });

  it('moves to active after a good change and is sent to setup', async () => {
    const res = await c.post('/auth/password/change', {
      currentPassword: OWNER.tempPassword,
      newPassword: STRONG,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ next: '/setup' });
    const session = sessionInfoSchema.parse((await c.get('/auth/session')).body);
    expect(session.stage).toBe('active');
    expect(session.setupComplete).toBe(false);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'auth.password.changed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.actorId).toBe(session.user.id);
    expect(await prisma.emailLog.count({ where: { template: 'password-changed' } })).toBe(1);
  });

  it('keeps the rest of the app locked until setup is complete', async () => {
    const res = await c.get('/health/details');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('setup_required');
    expect((await c.get('/setup/status')).body).toEqual({
      passwordChanged: true,
      organizationCreated: false,
      headOfficeCreated: false,
      complete: false,
    });
  });

  it('completes the organization and head office, then opens the app', async () => {
    const bad = await c.post('/setup/organization', {
      legalName: 'Northwind Dental Ltd',
      countryCode: 'ZZ',
      currencyCode: 'GBP',
      timeZone: 'Europe/London',
      headOffice: { name: 'Head office' },
    });
    expect(bad.body.code).toBe('validation_failed');
    const res = await c.post('/setup/organization', {
      legalName: 'Northwind Dental Ltd',
      tradingName: 'Northwind',
      countryCode: 'GB',
      currencyCode: 'GBP',
      timeZone: 'Europe/London',
      addressLines: ['1 High Street', 'Portsmouth'],
      headOffice: { name: 'Portsmouth', addressLines: [] },
    });
    expect(res.body).toMatchObject({ complete: true });
    expect(res.status).toBe(201);
    expect(res.body.complete).toBe(true);
    expect((await c.get('/health/details')).status).toBe(200);
    const again = await c.post('/setup/organization', {
      legalName: 'X',
      countryCode: 'GB',
      currencyCode: 'GBP',
      timeZone: 'Europe/London',
      headOffice: { name: 'Y' },
    });
    expect(again.body.code).toBe('conflict');
    const office = await prisma.location.findFirst({ where: { isHeadOffice: true } });
    expect(office?.addressLines).toEqual(['1 High Street', 'Portsmouth']);
  });

  it('serves the profile, updates the name and preferences, and audits both', async () => {
    const auditWhere = {
      action: { in: ['profile.personal.updated', 'profile.preferences.updated'] },
    };
    const before = await prisma.auditLog.count({ where: auditWhere });
    const me = await c.get('/profile');
    expect(me.body).toMatchObject({
      email: OWNER.email,
      fullName: OWNER.name,
      isSuperAdmin: true,
      twoFactorEnabled: false,
    });
    const renamed = await c.put('/profile', { fullName: 'Olive O. Owner' });
    expect(renamed.body.fullName).toBe('Olive O. Owner');
    const prefs = await c.put('/profile/preferences', { theme: 'dark', density: 'compact' });
    expect(prefs.body.preferences).toMatchObject({ theme: 'dark', density: 'compact' });
    expect(await prisma.auditLog.count({ where: auditWhere })).toBe(before + 2);
  });

  it('lists sessions, signs the others out, and the revoked one fails at once', async () => {
    const phone = await new Client(app).init();
    await phone.agent.set(
      'User-Agent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
    );
    const signIn = await phone.post('/auth/sign-in', {
      email: OWNER.email,
      password: STRONG,
      rememberMe: true,
    });
    expect(signIn.body).toEqual({ stage: 'active', next: '/dashboard' });
    expect(String(signIn.headers['set-cookie'])).toMatch(/Max-Age=/);
    const list = await c.get('/profile/sessions');
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const others = await c.post('/profile/sessions/sign-out-others');
    expect(others.body).toEqual({ revoked: 1 });
    const dead = await phone.get('/profile');
    expect(dead.status).toBe(401);
    expect((await c.get('/profile/sessions')).body.sessions).toHaveLength(1);
  });

  it('extends the idle timer on request', async () => {
    const before = sessionInfoSchema.parse((await c.get('/auth/session')).body);
    const res = await c.post('/auth/session/extend');
    expect(res.status).toBe(200);
    expect(new Date(res.body.idleExpiresAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before.idleExpiresAt).getTime(),
    );
  });

  it('signs out and the cookie no longer works', async () => {
    const res = await c.post('/auth/sign-out');
    expect(res.status).toBe(204);
    expect((await c.get('/profile')).status).toBe(401);
  });
});

describe('lockout', () => {
  it('locks the account after ten wrong passwords, emails the person, and the lock is in the database', async () => {
    const c = await new Client(app).init();
    const lockedBefore = await prisma.auditLog.count({ where: { action: 'auth.login.locked' } });
    let last: { status: number; body: { code: string } } = { status: 0, body: { code: '' } };
    for (let i = 0; i < 10; i += 1) {
      last = await c.post('/auth/sign-in', { email: OWNER.email, password: `wrong-${i}` });
    }
    expect(last.status).toBe(423);
    expect(last.body.code).toBe('account_locked');
    const user = await prisma.user.findFirstOrThrow({ where: { emailNormalized: OWNER.email } });
    expect(user.lockedUntil && user.lockedUntil > new Date()).toBe(true);
    expect(await prisma.emailLog.count({ where: { template: 'account-locked' } })).toBe(1);
    const right = await c.post('/auth/sign-in', { email: OWNER.email, password: STRONG });
    expect(right.body.code).toBe('account_locked');
    expect(await prisma.auditLog.count({ where: { action: 'auth.login.locked' } })).toBe(
      lockedBefore + 1,
    );
  });
});

describe('forgot and reset password', () => {
  let link = '';

  it('answers the same for any email and queues a link only for a real account', async () => {
    const c = await new Client(app).init();
    const unknown = await c.post('/auth/forgot-password', { email: 'nobody@example.test' });
    const known = await c.post('/auth/forgot-password', { email: OWNER.email });
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    const logs = await prisma.emailLog.findMany({ where: { template: 'password-reset' } });
    expect(logs).toHaveLength(1);
    link = await resetLinkFor(app, logs[0]!.id);
    expect(link).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=/);
  });

  it('refuses a bad token and a weak password', async () => {
    const c = await new Client(app).init();
    const bad = await c.post('/auth/reset-password', {
      token: 'not-a-real-token-at-all',
      newPassword: STRONGER,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('token_invalid');
    const token = new URL(link).searchParams.get('token')!;
    const weak = await c.post('/auth/reset-password', { token, newPassword: 'password123' });
    expect(weak.body.code).toBe('password_rejected');
  });

  it('resets once, clears the lock, signs every session out, and the link dies', async () => {
    const c = await new Client(app).init();
    const token = new URL(link).searchParams.get('token')!;
    const ok = await c.post('/auth/reset-password', { token, newPassword: STRONGER });
    expect(ok.status).toBe(200);
    const user = await prisma.user.findFirstOrThrow({ where: { emailNormalized: OWNER.email } });
    expect(user.lockedUntil).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    const reuse = await c.post('/auth/reset-password', { token, newPassword: STRONG });
    expect(reuse.body.code).toBe('token_invalid');
    const oldPassword = await c.post('/auth/sign-in', { email: OWNER.email, password: STRONG });
    expect(oldPassword.body.code).toBe('invalid_credentials');
    const newPassword = await c.post('/auth/sign-in', { email: OWNER.email, password: STRONGER });
    expect(newPassword.body).toEqual({ stage: 'active', next: '/dashboard' });
  });

  it('limits reset requests per email', async () => {
    const c = await new Client(app).init();
    let last = 0;
    for (let i = 0; i < 6; i += 1)
      last = (await c.post('/auth/forgot-password', { email: 'someone@example.test' })).status;
    expect(last).toBe(429);
  });
});

describe('the command line', () => {
  it('refuses to create a second Super Admin', async () => {
    await expect(createOwner()).rejects.toThrow(/exited with 1/);
  });
});
