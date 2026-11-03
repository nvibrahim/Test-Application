#!/usr/bin/env node
// Start or stop the local services (PostgreSQL, Valkey, Mailpit) with Docker Compose.
// Works the same on Windows (Docker Desktop or WSL), macOS and Linux: `pnpm services:up|down|status|logs`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'infra', 'compose', 'docker-compose.dev.yml');
const action = process.argv[2] ?? 'up';
const extras = process.argv.includes('--extras') ? ['--profile', 'extras'] : [];

const commands = {
  up: ['up', '-d', '--wait'],
  down: ['down'],
  status: ['ps'],
  logs: ['logs', '-f', '--tail', '100'],
};

const args = commands[action];
if (!args) {
  console.error('Usage: node scripts/services.mjs <up|down|status|logs> [--extras]');
  process.exit(2);
}

const result = spawnSync('docker', ['compose', '-f', file, ...extras, ...args], {
  stdio: 'inherit',
});
if (result.error) {
  console.error(
    'Docker is not available. Install Docker Desktop (or Docker inside WSL) and try again.',
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
