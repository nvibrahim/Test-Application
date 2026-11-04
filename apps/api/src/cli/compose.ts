import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Pure planning for the release and client commands, so the sequence of steps is unit tested
 * without Docker. `runSteps` executes a plan with `docker compose`; `--dry-run` prints it.
 */
export interface Step {
  title: string;
  /** docker compose arguments after `-p <project> --env-file <env> -f <file>` */
  compose?: string[];
  /** a plain command instead of docker compose */
  command?: string[];
  /** a health check against this URL (expects 200) */
  health?: string;
}

export interface ClientSpec {
  slug: string;
  root: string;
  version: string;
  image: string;
}

export const versionPattern = /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{7,12}$/;

export function nextVersion(date: Date, sha: string): string {
  return `${date.toISOString().slice(0, 10).replace(/-/g, '.')}-${sha.slice(0, 7)}`;
}

export function clientEnvFile(root: string, slug: string): string {
  return path.join(root, 'clients', slug, '.env');
}

export function composeFile(root: string): string {
  return path.join(root, 'infra', 'compose', 'docker-compose.prod.yml');
}

export function composeArgs(c: ClientSpec, args: string[]): string[] {
  return [
    'compose',
    '-p',
    `inspower-${c.slug}`,
    '--env-file',
    clientEnvFile(c.root, c.slug),
    '-f',
    composeFile(c.root),
    ...args,
  ];
}

/** Release one client: pre-release backup, migrate, restart, health; rollback on failure. */
export function planRelease(c: ClientSpec): { steps: Step[]; rollback: Step[] } {
  return {
    steps: [
      { title: 'Pull the image', compose: ['pull', '--quiet', 'api'] },
      {
        title: 'Pre-release backup',
        compose: [
          'run',
          '--rm',
          '--no-deps',
          'worker',
          'cli',
          'backup',
          'run',
          '--kind',
          'pre_release',
        ],
      },
      { title: 'Migrate the database', compose: ['--profile', 'jobs', 'run', '--rm', 'migrate'] },
      {
        title: 'Restart api, worker and web on the new version',
        compose: ['up', '-d', '--no-deps', 'api', 'worker', 'web'],
      },
      { title: 'Health check', health: `http://127.0.0.1:${healthPort(c)}/api/v1/health` },
    ],
    rollback: [
      {
        title: 'Roll back to the previous version',
        compose: ['up', '-d', '--no-deps', 'api', 'worker', 'web'],
      },
      {
        title: 'Health check after rollback',
        health: `http://127.0.0.1:${healthPort(c)}/api/v1/health`,
      },
    ],
  };
}

export function planNewClient(c: ClientSpec): Step[] {
  return [
    { title: 'Start the database and cache', compose: ['up', '-d', 'postgres', 'valkey'] },
    { title: 'Create the schema', compose: ['--profile', 'jobs', 'run', '--rm', 'migrate'] },
    { title: 'Start api, worker and web', compose: ['up', '-d', 'api', 'worker', 'web'] },
    { title: 'Health check', health: `http://127.0.0.1:${healthPort(c)}/api/v1/health` },
  ];
}

export function planHold(c: ClientSpec, on: boolean): Step[] {
  return [
    {
      title: on ? 'Turn maintenance mode on' : 'Turn maintenance mode off',
      compose: ['run', '--rm', '--no-deps', 'api', 'cli', 'maintenance', on ? 'on' : 'off'],
    },
  ];
}

export function planStatus(c: ClientSpec): Step[] {
  return [
    {
      title: `Status of inspower-${c.slug}`,
      compose: ['ps', '--format', 'table {{.Service}}\t{{.Status}}\t{{.Image}}'],
    },
  ];
}

/** The port the client's API is published on (127.0.0.1 only): `API_HOST_PORT` in its .env. */
export function healthPort(c: ClientSpec): string {
  const env = readEnvFile(clientEnvFile(c.root, c.slug));
  return env['API_HOST_PORT'] ?? env['HEALTH_PORT'] ?? '4000';
}

/**
 * The next free pair of local ports for a new client, so several clients share one server:
 * web 3101, 3102, ... and API 4101, 4102, ... skipping any pair another client already uses.
 */
export function nextHostPorts(used: Array<Record<string, string>>): { web: string; api: string } {
  const taken = new Set(used.flatMap((e) => [e['WEB_HOST_PORT'], e['API_HOST_PORT']]));
  for (let n = 101; n < 1000; n += 1) {
    const web = String(3000 + n);
    const api = String(4000 + n);
    if (!taken.has(web) && !taken.has(api)) return { web, api };
  }
  throw new Error('No free port pair between 3101 and 4999.');
}

export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^"(.*)"$/, '$1');
  }
  return out;
}

export function writeEnvValue(file: string, key: string, value: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(
    file,
    `${lines.filter((l, i, a) => !(l === '' && i === a.length - 1)).join('\n')}\n`,
    { mode: 0o600 },
  );
}

export function listClients(root: string): string[] {
  const dir = path.join(root, 'clients');
  if (!existsSync(dir)) return [];
  return require('node:fs')
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (d: { isDirectory(): boolean; name: string }) =>
        d.isDirectory() && existsSync(path.join(dir, d.name, '.env')),
    )
    .map((d: { name: string }) => d.name)
    .sort();
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', (err) => {
      console.error(`${command} could not start: ${err.message}`);
      resolve(127);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function checkHealth(url: string, attempts = 30): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** Runs the steps in order; stops at the first failure and returns it. */
export async function runSteps(
  c: ClientSpec,
  steps: Step[],
  dryRun: boolean,
): Promise<{ ok: boolean; failed?: Step }> {
  const env = {
    ...process.env,
    CLIENT_SLUG: c.slug,
    VERSION: c.version,
    IMAGE: c.image,
    CLIENT_ENV_FILE: clientEnvFile(c.root, c.slug),
  };
  for (const step of steps) {
    console.log(`\n== ${step.title}`);
    if (step.compose) {
      const args = composeArgs(c, step.compose);
      console.log(`   docker ${args.join(' ')}`);
      if (!dryRun && (await run('docker', args, env)) !== 0) return { ok: false, failed: step };
    } else if (step.command) {
      console.log(`   ${step.command.join(' ')}`);
      if (!dryRun && (await run(step.command[0]!, step.command.slice(1), env)) !== 0)
        return { ok: false, failed: step };
    } else if (step.health) {
      console.log(`   GET ${step.health}`);
      if (!dryRun && !(await checkHealth(step.health))) return { ok: false, failed: step };
    }
  }
  return { ok: true };
}
