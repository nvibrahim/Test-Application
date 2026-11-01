/**
 * Sign-in load test against the built API (`pnpm build` first). Never points at a real
 * deployment: it prepares the test database like the browser tests do, creates N users with a
 * shared Argon2id hash, then runs correct sign-ins with C concurrent clients, each request from
 * its own forwarded address so the per-address throttle does not shape the result. Prints p50,
 * p95, p99 and throughput, then shows the lockout engaging for one account.
 *
 *   DATABASE_URL=postgresql://inspower:inspower@127.0.0.1:5432/inspower_test \
 *   REDIS_URL=redis://127.0.0.1:6379/1 pnpm exec tsx scripts/load-sign-in.ts [users] [total] [concurrency]
 */
import { loadDotEnv } from '../src/platform/config/dotenv';
loadDotEnv();
import { spawn, execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import argon2 from 'argon2';
import request from 'supertest';
import { ARGON2_OPTIONS } from '../src/modules/auth/passwords.service';
import { loadEnv } from '../src/platform/config/config';
import { createPrismaClient } from '../src/platform/database/prisma.service';

const USERS = Number(process.argv[2] ?? 40);
const TOTAL = Number(process.argv[3] ?? 400);
const CONCURRENCY = Number(process.argv[4] ?? 10);
const PASSWORD = 'load-test-harbour-copper-91';
const PORT = 4100;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!/inspower_(test|e2e|load)/.test(env.DATABASE_URL)) {
    throw new Error('Refusing: DATABASE_URL must name a test database');
  }
  execSync('pnpm exec tsx scripts/e2e-reset.ts', { stdio: 'inherit', env: process.env });
  const prisma = createPrismaClient(env.DATABASE_URL);
  const org = await prisma.organization.findFirstOrThrow();
  const hash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
  await prisma.user.createMany({
    data: Array.from({ length: USERS }, (_, i) => ({
      organizationId: org.id,
      email: `load${i}@example.test`,
      emailNormalized: `load${i}@example.test`,
      fullName: `Load User ${i}`,
      status: 'active' as const,
      passwordHash: hash,
      passwordChangedAt: new Date(),
    })),
  });
  await prisma.$disconnect();

  const api = spawn('node', ['dist/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: String(PORT),
      API_HOST: '127.0.0.1',
      LOG_LEVEL: 'warn',
      COOKIE_SECURE: 'false',
      WEB_ORIGIN: 'http://localhost:3000',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: path.resolve(__dirname, '..'),
  });
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${base}/api/v1/health`);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    const latencies: number[] = [];
    let failures = 0;
    let next = 0;
    const started = performance.now();
    async function worker(id: number) {
      while (true) {
        const n = next++;
        if (n >= TOTAL) return;
        const agent = request.agent(base);
        const ip = `10.${(n >> 8) & 255}.${n & 255}.${id + 1}`;
        const csrf = await agent.get('/api/v1/auth/csrf').set('X-Forwarded-For', ip);
        const t0 = performance.now();
        const res = await agent
          .post('/api/v1/auth/sign-in')
          .set('x-csrf-token', csrf.body.token)
          .set('Origin', 'http://localhost:3000')
          .set('X-Forwarded-For', ip)
          .send({ email: `load${n % USERS}@example.test`, password: PASSWORD, rememberMe: false });
        latencies.push(performance.now() - t0);
        if (res.status !== 200) failures += 1;
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
    const seconds = (performance.now() - started) / 1000;
    latencies.sort((a, b) => a - b);
    console.log('\n## Sign-in load test');
    console.log(
      `Machine: ${os.cpus().length} CPUs (${os.cpus()[0]?.model ?? 'unknown'}), ${Math.round(os.totalmem() / 1_073_741_824)} GiB; Node ${process.version}`,
    );
    console.log(
      `Argon2id memory ${ARGON2_OPTIONS.memoryCost / 1024} MiB, t=${ARGON2_OPTIONS.timeCost}; ${USERS} users, ${TOTAL} sign-ins, ${CONCURRENCY} concurrent`,
    );
    console.log(`| Metric | Value |\n|---|---|`);
    console.log(`| Successful | ${TOTAL - failures} of ${TOTAL} |`);
    console.log(`| Throughput | ${(TOTAL / seconds).toFixed(1)} sign-ins/s |`);
    console.log(`| p50 | ${percentile(latencies, 50).toFixed(0)} ms |`);
    console.log(`| p95 | ${percentile(latencies, 95).toFixed(0)} ms |`);
    console.log(`| p99 | ${percentile(latencies, 99).toFixed(0)} ms |`);
    console.log(`| Max | ${latencies[latencies.length - 1]?.toFixed(0)} ms |`);

    // Lockout: wrong passwords for one account from one address until the account locks.
    const agent = request.agent(base);
    const csrf = await agent.get('/api/v1/auth/csrf').set('X-Forwarded-For', '10.99.0.1');
    const codes: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const t0 = performance.now();
      const res = await agent
        .post('/api/v1/auth/sign-in')
        .set('x-csrf-token', csrf.body.token)
        .set('Origin', 'http://localhost:3000')
        .set('X-Forwarded-For', '10.99.0.1')
        .send({
          email: 'load0@example.test',
          password: 'wrong-password-every-time',
          rememberMe: false,
        });
      codes.push(`${res.body.code ?? res.status}@${Math.round(performance.now() - t0)}ms`);
      if (res.body.code === 'account_locked') break;
    }
    console.log(`\nLockout sequence for one account: ${codes.join(', ')}`);
  } finally {
    api.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
