import { execSync } from 'node:child_process';
import path from 'node:path';

/** Applies the migrations to the test database once per run. */
export default function setup(): void {
  const url =
    process.env['DATABASE_URL'] ??
    'postgresql://inspower:inspower@127.0.0.1:5432/inspower_test?schema=public';
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
    cwd: path.resolve(__dirname, '..'),
  });
}
