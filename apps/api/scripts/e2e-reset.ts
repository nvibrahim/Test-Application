/**
 * Prepares the browser-test database: creates it if missing, applies migrations and the seed,
 * empties it, and creates the owner with a known temporary password. Run by Playwright's
 * global setup; never points at a real deployment.
 *   DATABASE_URL=postgresql://.../inspower_e2e tsx scripts/e2e-reset.ts
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { Redis } from 'ioredis';
import { Client } from 'pg';
import { adminCommand } from '../src/cli/admin';
import { loadEnv } from '../src/platform/config/config';
import { createPrismaClient } from '../src/platform/database/prisma.service';

export const E2E_OWNER = {
  email: 'owner@example.test',
  name: 'Olive Owner',
  tempPassword: 'temporary-walrus-lantern-42',
};

async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.replace(/^\//, '').split('?')[0]!;
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!exists.rowCount) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url || !/e2e/.test(url)) throw new Error('Refusing: DATABASE_URL must name an e2e database');
  await ensureDatabase(url);
  const cwd = path.resolve(__dirname, '..');
  for (const cmd of ['pnpm exec prisma migrate deploy', 'pnpm exec tsx prisma/seed.ts']) {
    execSync(cmd, { stdio: 'inherit', cwd, env: { ...process.env, DATABASE_URL: url } });
  }
  // Throttle counters and caches from an earlier run must not leak into this one.
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl && /\/2$/.test(redisUrl)) {
    const redis = new Redis(redisUrl);
    await redis.flushdb();
    await redis.quit();
  }
  const prisma = createPrismaClient(url);
  try {
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
  } finally {
    await prisma.$disconnect();
  }
  process.env['INSPOWER_ADMIN_PASSWORD'] = E2E_OWNER.tempPassword;
  const code = await adminCommand(loadEnv(), [
    'create',
    '--email',
    E2E_OWNER.email,
    '--name',
    E2E_OWNER.name,
    '--non-interactive',
    'true',
  ]);
  if (code !== 0) throw new Error(`admin create exited with ${code}`);
  // No breached-password network call and no sign-in delays during browser tests.
  const prisma2 = createPrismaClient(url);
  try {
    const org = await prisma2.organization.findFirstOrThrow();
    await prisma2.appSetting.createMany({
      data: [
        {
          organizationId: org.id,
          section: 'security',
          key: 'password',
          value: { breachedPasswordCheck: false },
        },
        {
          organizationId: org.id,
          section: 'security',
          key: 'lockout',
          value: { delayAfterAttempts: 20 },
        },
      ],
    });
  } finally {
    await prisma2.$disconnect();
  }
  console.log('e2e database ready');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
