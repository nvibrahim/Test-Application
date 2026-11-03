import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { Client } from 'pg';

/** The pieces of a PostgreSQL URL the command-line tools and the admin connection need. */
export interface DatabaseTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  url: string;
}

export function parseDatabaseUrl(url: string): DatabaseTarget {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    url,
  };
}

export function withDatabase(target: DatabaseTarget, database: string): DatabaseTarget {
  const u = new URL(target.url);
  u.pathname = `/${database}`;
  return { ...target, database, url: u.toString() };
}

const safeDbName = /^[a-z_][a-z0-9_]{0,62}$/;
export function assertDbName(name: string): string {
  if (!safeDbName.test(name)) throw new Error(`Database name "${name}" is not allowed`);
  return name;
}

function tool(binDir: string, name: string): string {
  return binDir ? path.join(binDir, name) : name;
}

function connectionArgs(t: DatabaseTarget): string[] {
  return ['--host', t.host, '--port', String(t.port), '--username', t.user, '--no-password'];
}

/** `pg_dump -F c` of the database as a stream. The promise settles when the process exits. */
export function pgDump(
  binDir: string,
  target: DatabaseTarget,
): { stdout: Readable; done: Promise<void> } {
  const child = spawn(
    tool(binDir, 'pg_dump'),
    [...connectionArgs(target), '--format', 'custom', '--compress', '6', target.database],
    { env: { ...process.env, PGPASSWORD: target.password }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return { stdout: child.stdout, done: exitOf(child, 'pg_dump') };
}

/** `pg_restore` into an existing (empty) database from a plaintext stream. */
export async function pgRestore(
  binDir: string,
  target: DatabaseTarget,
  source: Readable,
): Promise<void> {
  const child = spawn(
    tool(binDir, 'pg_restore'),
    [
      ...connectionArgs(target),
      '--dbname',
      target.database,
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
    ],
    { env: { ...process.env, PGPASSWORD: target.password }, stdio: ['pipe', 'ignore', 'pipe'] },
  );
  const done = exitOf(child, 'pg_restore');
  await pump(source, child.stdin);
  await done;
}

function pump(source: Readable, sink: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    source.on('error', (err) => {
      sink.destroy();
      reject(err);
    });
    sink.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') return resolve();
      reject(err);
    });
    sink.on('finish', resolve);
    source.pipe(sink);
  });
}

function exitOf(child: ReturnType<typeof spawn>, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', (err) =>
      reject(
        new Error(`${name} could not start (${err.message}). Is PostgreSQL's client installed?`),
      ),
    );
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${name} exited with ${code}: ${stderr.trim().split('\n').pop() ?? ''}`));
    });
  });
}

/** Runs statements that cannot run inside the live database (create, drop, rename). */
export async function adminSql<T>(
  target: DatabaseTarget,
  work: (run: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>) => Promise<T>,
): Promise<T> {
  const admin = withDatabase(target, 'postgres');
  const client = new Client({ connectionString: admin.url });
  await client.connect();
  try {
    return await work((sql) => client.query(sql));
  } finally {
    await client.end();
  }
}

export async function dropDatabaseIfExists(target: DatabaseTarget, name: string): Promise<void> {
  assertDbName(name);
  await adminSql(target, async (run) => {
    await run(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
    );
    await run(`DROP DATABASE IF EXISTS "${name}"`);
  });
}

export async function createEmptyDatabase(target: DatabaseTarget, name: string): Promise<void> {
  assertDbName(name);
  await adminSql(target, async (run) => {
    await run(`CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`);
  });
}

/** Terminates connections to both, renames live to `old` and `fresh` to live. */
export async function swapDatabases(
  target: DatabaseTarget,
  fresh: string,
  old: string,
): Promise<void> {
  assertDbName(fresh);
  assertDbName(old);
  const live = assertDbName(target.database);
  await adminSql(target, async (run) => {
    await run(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('${live}', '${fresh}') AND pid <> pg_backend_pid()`,
    );
    await run(`ALTER DATABASE "${live}" RENAME TO "${old}"`);
    await run(`ALTER DATABASE "${fresh}" RENAME TO "${live}"`);
  });
}

/** Row counts of a few tables, for the manifest and the drill. */
export const COUNTED_TABLES = ['users', 'roles', 'audit_logs', 'app_settings'] as const;
export async function countRows(target: DatabaseTarget): Promise<Record<string, number>> {
  const client = new Client({ connectionString: target.url });
  await client.connect();
  try {
    const counts: Record<string, number> = {};
    for (const table of COUNTED_TABLES) {
      const res = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
      counts[table] = Number((res.rows[0] as { n: number }).n);
    }
    return counts;
  } finally {
    await client.end();
  }
}

export async function latestMigration(target: DatabaseTarget): Promise<string | null> {
  const client = new Client({ connectionString: target.url });
  await client.connect();
  try {
    const res = await client.query(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
    );
    return (res.rows[0] as { migration_name: string } | undefined)?.migration_name ?? null;
  } finally {
    await client.end();
  }
}
