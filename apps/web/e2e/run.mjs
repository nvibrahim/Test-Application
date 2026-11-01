#!/usr/bin/env node
// `pnpm test:e2e`: reset the e2e database (Playwright starts its servers before any global
// setup, so this has to run first), then hand every argument to Playwright.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const api = path.resolve(here, '../../api');
const env = {
  ...process.env,
  DATABASE_URL:
    process.env['E2E_DATABASE_URL'] ??
    'postgresql://inspower:inspower@127.0.0.1:5432/inspower_e2e?schema=public',
  REDIS_URL: process.env['E2E_REDIS_URL'] ?? 'redis://127.0.0.1:6379/2',
  AUTH_ENCRYPTION_KEY:
    process.env['AUTH_ENCRYPTION_KEY'] ?? Buffer.alloc(32, 0xe2).toString('base64'),
  BACKUP_ENCRYPTION_KEY:
    process.env['BACKUP_ENCRYPTION_KEY'] ?? Buffer.alloc(32, 0xe3).toString('base64'),
  WEB_ORIGIN: 'http://localhost:3000',
};

const reset = spawnSync('pnpm', ['exec', 'tsx', 'scripts/e2e-reset.ts'], {
  cwd: api,
  stdio: 'inherit',
  env,
});
if (reset.status !== 0) process.exit(reset.status ?? 1);

const test = spawnSync('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], {
  cwd: path.resolve(here, '..'),
  stdio: 'inherit',
  env: process.env,
});
process.exit(test.status ?? 1);
