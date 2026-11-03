import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CSRF_HEADER, defaultSecuritySettings } from '@inspower/shared';
import { adminCommand } from '../src/cli/admin';
import { loadEnv } from '../src/platform/config/config';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { QueueService } from '../src/platform/jobs/queue.service';
import { RedisService } from '../src/platform/redis/redis.service';

export const OWNER = {
  email: 'owner@example.test',
  name: 'Olive Owner',
  tempPassword: 'temporary-walrus-lantern-42',
};

/** Empties the test database (the audit log is append-only and stays) and the throttle counters. */
export async function resetDatabase(app: INestApplication, prisma: PrismaService): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
  await prisma.role.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.organization.deleteMany();
  const redis = app.get(RedisService).client;
  const keys = await redis.keys('*');
  if (keys.length) await redis.del(...keys.map((k) => k.replace(/^inspower_test:/, '')));
}

/** The first Super Admin, exactly as `pnpm inspower admin create` makes it. */
export async function createOwner(): Promise<void> {
  process.env['INSPOWER_ADMIN_PASSWORD'] = OWNER.tempPassword;
  const code = await adminCommand(loadEnv(), [
    'create',
    '--email',
    OWNER.email,
    '--name',
    OWNER.name,
    '--non-interactive',
    'true',
  ]);
  delete process.env['INSPOWER_ADMIN_PASSWORD'];
  if (code !== 0) throw new Error(`admin create exited with ${code}`);
}

/** Test-friendly security settings: no breached-password network call, no sign-in delays. */
export async function relaxSecuritySettings(prisma: PrismaService): Promise<void> {
  const org = await prisma.organization.findFirstOrThrow();
  await prisma.appSetting.createMany({
    data: [
      {
        organizationId: org.id,
        section: 'security',
        key: 'password',
        value: { ...defaultSecuritySettings.password, breachedPasswordCheck: false },
      },
      {
        organizationId: org.id,
        section: 'security',
        key: 'lockout',
        value: { ...defaultSecuritySettings.lockout, delayAfterAttempts: 20 },
      },
    ],
  });
}

/** A browser-like client: keeps cookies and sends the CSRF header and Origin on writes. */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  private csrf = '';
  constructor(
    app: INestApplication,
    private readonly origin = 'http://localhost:3000',
  ) {
    this.agent = request.agent(app.getHttpServer());
  }
  async init(): Promise<this> {
    const res = await this.agent.get('/api/v1/auth/csrf');
    this.csrf = res.body.token;
    return this;
  }
  get(path: string) {
    return this.agent.get(`/api/v1${path}`);
  }
  post(path: string, body?: unknown) {
    return this.agent
      .post(`/api/v1${path}`)
      .set(CSRF_HEADER, this.csrf)
      .set('Origin', this.origin)
      .send(body ?? {});
  }
  put(path: string, body?: unknown) {
    return this.agent
      .put(`/api/v1${path}`)
      .set(CSRF_HEADER, this.csrf)
      .set('Origin', this.origin)
      .send(body ?? {});
  }
  delete(path: string) {
    return this.agent
      .delete(`/api/v1${path}`)
      .set(CSRF_HEADER, this.csrf)
      .set('Origin', this.origin);
  }
  /** Raw post without CSRF, to prove the refusal. */
  postRaw(path: string, body?: unknown) {
    return this.agent.post(`/api/v1${path}`).send(body ?? {});
  }
}

/** Reads the link out of a queued password-reset email (the job data, never the log row). */
export async function resetLinkFor(app: INestApplication, emailLogId: string): Promise<string> {
  const job = await app.get(QueueService).queue('email').getJob(emailLogId);
  const params = (job?.data as { template: { params: { link?: string } } } | undefined)?.template
    .params;
  if (!params?.link) throw new Error('No reset link in the queued email');
  return params.link;
}
