import { execSync } from 'node:child_process';
import path from 'node:path';

/** Applies the migrations and the reference-data seed to the test database once per run. */
export default function setup(): void {
  const url =
    process.env['DATABASE_URL'] ??
    'postgresql://inspower:inspower@127.0.0.1:5432/inspower_test?schema=public';
  for (const command of ['pnpm exec prisma migrate deploy', 'pnpm exec tsx prisma/seed.ts']) {
    execSync(command, {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: url },
      cwd: path.resolve(__dirname, '..'),
    });
  }
}
