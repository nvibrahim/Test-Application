import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSRF_HEADER, contrastRatio } from '@inspower/shared';
import { PrismaService } from '../src/platform/database/prisma.service';
import { createTestApp } from './app';
import { Client, createOwner, OWNER, relaxSecuritySettings, resetDatabase } from './fixtures';

let app: INestApplication;
let prisma: PrismaService;
const PASSWORD = 'orbit-meadow-copper-sixteen-91';
let owner: Client;

const PNG_64x64 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
  Buffer.from([0, 0, 0, 64, 0, 0, 0, 64]),
  Buffer.alloc(32),
]);
const PNG_64x32 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
  Buffer.from([0, 0, 0, 64, 0, 0, 0, 32]),
  Buffer.alloc(32),
]);

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
});
afterAll(async () => app.close());

describe('appearance', () => {
  it('serves the built-in look with no css and an ETag that answers 304', async () => {
    const res = await owner.get('/appearance');
    expect(res.status).toBe(200);
    expect(res.body.css).toBe('');
    expect(res.body.theme.brand).toBe('#1d4ed8');
    const etag = res.headers['etag'];
    const again = await owner.agent.get('/api/v1/appearance').set('If-None-Match', etag);
    expect(again.status).toBe(304);
  });

  it('a saved brand colour changes every token with AA contrast kept; a colour white cannot read on is darkened', async () => {
    await owner.put('/settings/appearance', {
      brandColor: '#ffff00',
      sidebarStyle: 'brand',
      topBarStyle: 'brand',
    });
    const res = await owner.get('/appearance');
    expect(res.body.theme.adjusted).toBe(true);
    expect(res.body.css).toContain('--primary:');
    expect(
      contrastRatio(res.body.theme.light['primary-foreground'], res.body.theme.light['primary']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(res.body.theme.dark['primary-foreground'], res.body.theme.dark['primary']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(res.body.theme.attributes['data-sidebar']).toBe('brand');
    await owner.put('/settings/appearance', {
      brandColor: '#0f766e',
      sidebarStyle: 'light',
      topBarStyle: 'plain',
    });
  });

  it('uploads a PNG logo by its bytes, serves it back as a picture, refuses SVG and a non-square favicon, and removes it', async () => {
    const up = await owner.agent
      .put('/api/v1/settings/brand/logo_light')
      .set(CSRF_HEADER, (owner as unknown as { csrf: string }).csrf)
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/octet-stream')
      .send(PNG_64x64);
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ slot: 'logo_light', type: 'image/png', width: 64, height: 64 });
    const appearance = await owner.get('/appearance');
    expect(appearance.body.assets.logo_light).toMatch(/^\/api\/v1\/brand\/logo_light\?v=/);
    const pic = await request(app.getHttpServer()).get('/api/v1/brand/logo_light');
    expect(pic.status).toBe(200);
    expect(pic.headers['content-type']).toBe('image/png');
    expect(pic.headers['x-content-type-options']).toBe('nosniff');
    const svg = await owner.agent
      .put('/api/v1/settings/brand/logo_dark')
      .set(CSRF_HEADER, (owner as unknown as { csrf: string }).csrf)
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'image/svg+xml')
      .send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect(svg.body.code).toBe('validation_failed');
    const wide = await owner.agent
      .put('/api/v1/settings/brand/favicon')
      .set(CSRF_HEADER, (owner as unknown as { csrf: string }).csrf)
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'image/png')
      .send(PNG_64x32);
    expect(wide.body.message).toMatch(/square/);
    expect((await owner.delete('/settings/brand/logo_light')).status).toBe(204);
    expect((await request(app.getHttpServer()).get('/api/v1/brand/logo_light')).status).toBe(404);
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['settings.brand.uploaded', 'settings.brand.removed'] } },
      }),
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('the public contact form', () => {
  it('is off until a support email is set, then emails support, keeps nothing but an audit row, ignores bots and limits per address', async () => {
    const anon = await new Client(app).init();
    const off = await anon.post('/public/contact', {
      name: 'Vis Itor',
      email: 'vis@example.test',
      message: 'Hello there, I have a question.',
    });
    expect(off.body.code).toBe('not_found');
    await owner.put('/settings/general', {
      supportEmail: 'help@northwind.test',
      landing: { showContactForm: true },
    });
    const ok = await anon.post('/public/contact', {
      name: 'Vis Itor',
      email: 'vis@example.test',
      message: 'Hello there, I have a question.',
    });
    expect(ok.status).toBe(202);
    const mail = await prisma.emailLog.findFirst({ where: { template: 'contact-message' } });
    expect(mail?.toAddress).toBe('help@northwind.test');
    expect(await prisma.auditLog.count({ where: { action: 'public.contact.submitted' } })).toBe(1);
    const bot = await anon.post('/public/contact', {
      name: 'Bot',
      email: 'bot@example.test',
      message: 'Buy things now please thanks',
      company_website: 'x',
    });
    expect(bot.status).toBe(400); // the honeypot has max length 0, so a filled one fails validation and is dropped
    for (let i = 0; i < 5; i += 1)
      await anon.post('/public/contact', {
        name: 'Vis Itor',
        email: 'vis@example.test',
        message: 'Another message of some length.',
      });
    const limited = await anon.post('/public/contact', {
      name: 'Vis Itor',
      email: 'vis@example.test',
      message: 'One too many messages here.',
    });
    expect(limited.body.code).toBe('rate_limited');
  });
});
