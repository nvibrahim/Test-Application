import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The owner account the browser journeys share. The database is reset once per run, but a
 * journey that changes the owner's password (forgot password) runs only where Mailpit exists,
 * so the current password is kept in a small state file that `run.mjs` clears at the start.
 */
export const OWNER_EMAIL = 'owner@example.test';
export const OWNER_NAME = 'Olive Owner';
export const OWNER_TEMP_PASSWORD = 'temporary-walrus-lantern-42';
export const OWNER_FIRST_PASSWORD = 'orbit-meadow-copper-sixteen-91';

const stateFile = path.join(__dirname, '..', '.e2e-state', 'owner-password');

export function ownerPassword(): string {
  try {
    return readFileSync(stateFile, 'utf8').trim() || OWNER_FIRST_PASSWORD;
  } catch {
    return OWNER_FIRST_PASSWORD;
  }
}

export function rememberOwnerPassword(password: string): void {
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, password);
}

export function forgetOwnerPassword(): void {
  rmSync(path.dirname(stateFile), { recursive: true, force: true });
}
