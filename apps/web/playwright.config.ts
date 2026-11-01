import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Browser tests at phone, tablet and desktop widths, with axe. The API, worker and web app are
 * started from their production builds against a database of their own (`inspower_e2e`,
 * Redis database 2), so they never touch development data. Run `pnpm build` first.
 */
const root = path.resolve(__dirname, '../..');
const DATABASE_URL =
  process.env['E2E_DATABASE_URL'] ??
  'postgresql://inspower:inspower@127.0.0.1:5432/inspower_e2e?schema=public';
const REDIS_URL = process.env['E2E_REDIS_URL'] ?? 'redis://127.0.0.1:6379/2';
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL,
  REDIS_URL,
  REDIS_PREFIX: 'inspower_e2e',
  WEB_ORIGIN: 'http://localhost:3000',
  API_HOST: '127.0.0.1',
  API_PORT: '4000',
  API_INTERNAL_URL: 'http://127.0.0.1:4000',
  COOKIE_SECURE: 'false',
  AUTH_ENCRYPTION_KEY:
    process.env['AUTH_ENCRYPTION_KEY'] ?? Buffer.alloc(32, 0xe2).toString('base64'),
  BACKUP_ENCRYPTION_KEY:
    process.env['BACKUP_ENCRYPTION_KEY'] ?? Buffer.alloc(32, 0xe3).toString('base64'),
  SMTP_HOST: process.env['SMTP_HOST'] ?? '127.0.0.1',
  SMTP_PORT: process.env['SMTP_PORT'] ?? '1025',
  LOG_LEVEL: 'warn',
  PORT: '3000',
  HOSTNAME: '127.0.0.1',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], defaultBrowserType: 'chromium' } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: path.join(root, 'apps/api'),
      url: 'http://127.0.0.1:4000/api/v1/health',
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node dist/worker/main.js',
      cwd: path.join(root, 'apps/api'),
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next start --port 3000 --hostname 127.0.0.1',
      cwd: path.join(root, 'apps/web'),
      url: 'http://localhost:3000/health',
      env,
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
