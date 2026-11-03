import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  sessionInfoSchema,
  twoFactorSetupResponseSchema,
  twoFactorStatusSchema,
} from '@inspower/shared';
import { PrismaService } from '../src/platform/database/prisma.service';
import { currentTotp } from '../src/modules/two-factor/totp';
import { createTestApp } from './app';
import { Client, createOwner, OWNER, relaxSecuritySettings, resetDatabase } from './fixtures';

let app: INestApplication;
let prisma: PrismaService;
const PASSWORD = 'orbit-meadow-copper-sixteen-91';
let owner: Client;
let secret = '';
let recoveryCodes: string[] = [];

/** A code for a step not used yet, within the ±1 step the API accepts; waits for the next step if it must. */
async function freshCode(): Promise<string> {
  const row = await prisma.userTwoFactor.findFirst({ select: { lastUsedStep: true } });
  const last = row?.lastUsedStep == null ? -1 : Number(row.lastUsedStep);
  const now = Date.now();
  const step = Math.floor(now / 30_000);
  const target = Math.max(step, last + 1);
  if (target > step + 1) await new Promise((r) => setTimeout(r, (target - 1) * 30_000 - now + 100));
  return currentTotp(secret, Math.max(now, target * 30_000 + 1));
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
    headOffice: { name: 'HQ' },
  });
});
afterAll(async () => app.close());

describe('setting up two-step verification', () => {
  it('starts off, with the reminder showing', async () => {
    const status = twoFactorStatusSchema.parse((await owner.get('/two-factor')).body);
    expect(status).toMatchObject({
      enabled: false,
      recoveryCodesLeft: 0,
      reminder: { show: true, intervalDays: 7 },
    });
  });

  it('hides the reminder once dismissed', async () => {
    expect((await owner.post('/two-factor/reminder/dismiss')).status).toBe(204);
    expect(twoFactorStatusSchema.parse((await owner.get('/two-factor')).body).reminder.show).toBe(
      false,
    );
  });

  it('returns a QR code, a key and an otpauth link naming the organization', async () => {
    const res = await owner.post('/two-factor/setup');
    expect(res.status).toBe(200);
    const setup = twoFactorSetupResponseSchema.parse(res.body);
    expect(setup.issuer).toBe('Northwind Dental Ltd');
    expect(setup.otpauthUrl).toContain('Northwind%20Dental%20Ltd');
    secret = setup.secret;
    expect(await prisma.userTwoFactor.count()).toBe(0);
  });

  it('refuses a wrong first code, accepts the right one, and hands over ten recovery codes once', async () => {
    const wrong = await owner.post('/two-factor/confirm', { code: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('invalid_code');
    const ok = await owner.post('/two-factor/confirm', { code: currentTotp(secret) });
    expect(ok.status).toBe(200);
    recoveryCodes = ok.body.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const row = await prisma.userTwoFactor.findFirstOrThrow();
    expect(row.confirmedAt).not.toBeNull();
    expect(row.secretEncrypted).not.toContain(secret);
    expect(await prisma.recoveryCode.count({ where: { usedAt: null } })).toBe(10);
    expect(await prisma.emailLog.count({ where: { template: 'two-factor-enabled' } })).toBe(1);
    const status = twoFactorStatusSchema.parse((await owner.get('/two-factor')).body);
    expect(status).toMatchObject({
      enabled: true,
      recoveryCodesLeft: 10,
      reminder: { show: false },
    });
  });

  it('cannot be set up twice while on', async () => {
    expect((await owner.post('/two-factor/setup')).body.code).toBe('conflict');
  });
});

describe('signing in with two-step verification', () => {
  let phone: Client;

  it('lands in the verify stage, where active routes are refused', async () => {
    phone = await new Client(app).init();
    const res = await phone.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    expect(res.body).toEqual({ stage: 'verify_two_factor', next: '/two-factor' });
    expect((await phone.get('/profile')).body.code).toBe('wrong_stage');
    expect(
      sessionInfoSchema.parse((await phone.get('/auth/session')).body).user.twoFactorEnabled,
    ).toBe(true);
  });

  it('refuses a wrong code and a replayed code, accepts a fresh one, and trusts the device', async () => {
    expect((await phone.post('/auth/two-factor/verify', { code: '123456' })).body.code).toBe(
      'invalid_code',
    );
    const fresh = await freshCode();
    const ok = await phone.post('/auth/two-factor/verify', { code: fresh, trustDevice: true });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ next: '/dashboard' });
    expect(String(ok.headers['set-cookie'])).toMatch(/inspower_trusted=.*HttpOnly/);
    expect((await phone.get('/profile')).status).toBe(200);
    // The same step again is a replay
    const replayer = await new Client(app).init();
    await replayer.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    expect((await replayer.post('/auth/two-factor/verify', { code: fresh })).body.code).toBe(
      'invalid_code',
    );
    const status = twoFactorStatusSchema.parse((await phone.get('/two-factor')).body);
    expect(status.trustedDevices).toHaveLength(1);
    expect(status.trustedDevices[0]!.current).toBe(true);
  });

  it('skips the verify stage on the trusted device', async () => {
    await phone.post('/auth/sign-out');
    const res = await phone.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    expect(res.body).toEqual({ stage: 'active', next: '/dashboard' });
  });

  it('accepts a recovery code once, tells the person, and refuses it the second time', async () => {
    const laptop = await new Client(app).init();
    await laptop.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    const code = recoveryCodes[0]!;
    const ok = await laptop.post('/auth/two-factor/verify', { recoveryCode: code.toLowerCase() });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ next: '/dashboard', recoveryCodesLeft: 9 });
    expect(
      await prisma.notification.count({ where: { type: 'security.recovery_code_used' } }),
    ).toBe(1);
    expect(await prisma.emailLog.count({ where: { template: 'recovery-code-used' } })).toBe(1);
    const again = await new Client(app).init();
    await again.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    expect((await again.post('/auth/two-factor/verify', { recoveryCode: code })).body.code).toBe(
      'invalid_code',
    );
  });

  it('ends the session after five wrong codes', async () => {
    const c = await new Client(app).init();
    await c.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    let last = { status: 0, body: { code: '' } };
    for (let i = 0; i < 5; i += 1)
      last = await c.post('/auth/two-factor/verify', { code: '000000' });
    expect(last.status).toBe(401);
    expect(last.body.code).toBe('unauthenticated');
    expect((await c.get('/auth/session')).status).toBe(401);
  });
});

describe('step-up and the sensitive actions', () => {
  it('refuses regenerate and disable without step-up, then allows them after the password or a code', async () => {
    const no = await owner.post('/two-factor/recovery-codes/regenerate');
    expect(no.status).toBe(403);
    expect(no.body.code).toBe('step_up_required');
    expect((await owner.get('/auth/step-up')).body).toMatchObject({
      active: false,
      methods: ['password', 'totp'],
    });
    expect((await owner.post('/auth/step-up', { password: 'wrong-wrong' })).body.code).toBe(
      'invalid_credentials',
    );
    const up = await owner.post('/auth/step-up', { password: PASSWORD });
    expect(up.body.active).toBe(true);
    const regen = await owner.post('/two-factor/recovery-codes/regenerate');
    expect(regen.status).toBe(200);
    expect(regen.body.recoveryCodes).toHaveLength(10);
    expect(regen.body.recoveryCodes).not.toContain(recoveryCodes[1]);
    expect(await prisma.stepUpGrant.count({ where: { method: 'password' } })).toBeGreaterThan(0);
  });

  it('a code also steps up, with replay protection', async () => {
    const c = await new Client(app).init();
    await c.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    const code = await freshCode();
    expect((await c.post('/auth/two-factor/verify', { code })).status).toBe(200);
    const replay = await c.post('/auth/step-up', { code });
    expect(replay.body.code).toBe('invalid_credentials');
  });
});

describe('the Users list and the administrator reset', () => {
  it('lists people with their two-step state and filters by it', async () => {
    const all = await owner.get('/users');
    expect(all.status).toBe(200);
    expect(all.body.users[0]).toMatchObject({
      email: OWNER.email,
      twoFactorEnabled: true,
      roles: ['Super Admin'],
    });
    expect((await owner.get('/users?twoFactor=off')).body.users).toHaveLength(0);
    expect((await owner.get('/users?twoFactor=on')).body.total).toBe(1);
  });

  it('resets two-step verification for a person (step-up), signs them out and emails them', async () => {
    const me = await owner.get('/profile');
    const noStepUp = await new Client(app).init();
    await noStepUp.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    expect(
      (await noStepUp.post('/auth/two-factor/verify', { code: await freshCode() })).status,
    ).toBe(200);
    expect((await noStepUp.post(`/users/${me.body.id}/two-factor/reset`)).body.code).toBe(
      'step_up_required',
    );
    await noStepUp.post('/auth/step-up', { password: PASSWORD });
    const res = await noStepUp.post(`/users/${me.body.id}/two-factor/reset`);
    expect(res.status).toBe(204);
    expect(await prisma.userTwoFactor.count()).toBe(0);
    expect(await prisma.trustedDevice.count({ where: { revokedAt: null } })).toBe(0);
    expect(await prisma.emailLog.count({ where: { template: 'two-factor-reset-by-admin' } })).toBe(
      1,
    );
    expect(
      await prisma.auditLog.count({ where: { action: 'users.two_factor.reset' } }),
    ).toBeGreaterThan(0);
    // every session was revoked, including the one that did it
    expect((await noStepUp.get('/profile')).status).toBe(401);
  });

  it('sends a reminder by hand to someone without two-step verification', async () => {
    const c = await new Client(app).init();
    await c.post('/auth/sign-in', { email: OWNER.email, password: PASSWORD });
    const me = await c.get('/profile');
    const remind = await c.post(`/users/${me.body.id}/two-factor/remind`);
    expect(remind.body).toEqual({});
    expect(remind.status).toBe(204);
    expect(await prisma.emailLog.count({ where: { template: 'two-factor-reminder' } })).toBe(1);
  });
});
