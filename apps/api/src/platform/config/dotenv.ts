import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

/**
 * Loads `.env` from the repository root (and the current folder) without overriding values
 * already in the environment, so containers and CI keep what they were given.
 */
export function loadDotEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../../../.env'), // from dist/platform/config
    path.resolve(__dirname, '../../../../.env'), // from src/platform/config
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      config({ path: file, override: false, quiet: true });
      return;
    }
  }
}
