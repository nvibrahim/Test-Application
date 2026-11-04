import { execSync } from 'node:child_process';
import path from 'node:path';
import {
  clientEnvFile,
  listClients,
  nextHostPorts,
  nextVersion,
  planHold,
  planNewClient,
  planRelease,
  planStatus,
  readEnvFile,
  runSteps,
  versionPattern,
  writeEnvValue,
  type ClientSpec,
} from './compose';

/**
 * `inspower release <version> [--client <slug>|--all] [--dry-run]`: pre-release backup, migrate,
 * restart, health check; on failure the previous version is put back and checked. With `--all`
 * the demo client (clients/demo) goes first and a failure there stops the rest.
 *
 * `inspower client new <slug> | deploy-all <version> | hold <slug> on|off | rollback <slug> |
 * status [slug]`. Clients live in `clients/<slug>/.env` next to the repository (or
 * `INSPOWER_CLIENTS_ROOT`). Everything is `docker compose` underneath, so it runs on any OS.
 */
export async function releaseCommand(args: string[]): Promise<number> {
  const flags = parse(args);
  const version = flags._[0];
  if (!version || !versionPattern.test(version)) {
    console.error(
      `Usage: inspower release <YYYY.MM.DD-sha> [--client slug | --all] [--image name] [--dry-run]\nNext version would be ${nextVersion(new Date(), currentSha())}`,
    );
    return 2;
  }
  const root = clientsRoot();
  const image = flags.opts['image'] ?? process.env['INSPOWER_IMAGE'] ?? 'ghcr.io/inspower/inspower';
  const targets =
    flags.opts['all'] !== undefined
      ? orderDemoFirst(listClients(root))
      : flags.opts['client']
        ? [flags.opts['client']]
        : [];
  if (!targets.length) {
    console.error('Name a client with --client <slug> or use --all.');
    return 2;
  }
  for (const slug of targets) {
    const code = await releaseOne(
      { slug, root, version, image },
      flags.opts['dry-run'] !== undefined,
    );
    if (code !== 0) {
      console.error(
        `\nStopped: ${slug} did not come up healthy on ${version}. Remaining clients were not touched.`,
      );
      return code;
    }
  }
  return 0;
}

async function releaseOne(c: ClientSpec, dryRun: boolean): Promise<number> {
  const env = readEnvFile(clientEnvFile(c.root, c.slug));
  const previous = env['VERSION'];
  console.log(
    `\n### ${c.slug}: ${previous ?? 'unknown'} -> ${c.version}${dryRun ? ' (dry run)' : ''}`,
  );
  if (!dryRun) writeEnvValue(clientEnvFile(c.root, c.slug), 'VERSION', c.version);
  const plan = planRelease(c);
  const result = await runSteps(c, plan.steps, dryRun);
  if (result.ok) {
    console.log(`\n${c.slug} is on ${c.version}.`);
    return 0;
  }
  console.error(
    `\nStep failed: ${result.failed?.title}. Rolling back to ${previous ?? 'the previous image'}.`,
  );
  if (previous && !dryRun) writeEnvValue(clientEnvFile(c.root, c.slug), 'VERSION', previous);
  const back = await runSteps({ ...c, version: previous ?? c.version }, plan.rollback, dryRun);
  if (!back.ok)
    console.error('Rollback did not come up healthy either. Follow docs/runbooks/incident.md.');
  return 1;
}

export async function clientCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const flags = parse(rest);
  const root = clientsRoot();
  const dryRun = flags.opts['dry-run'] !== undefined;
  const image = flags.opts['image'] ?? process.env['INSPOWER_IMAGE'] ?? 'ghcr.io/inspower/inspower';
  const spec = (slug: string, version?: string): ClientSpec => ({
    slug,
    root,
    image,
    version: version ?? readEnvFile(clientEnvFile(root, slug))['VERSION'] ?? 'latest',
  });
  switch (sub) {
    case 'new': {
      const slug = flags._[0];
      if (!slug || !/^[a-z][a-z0-9-]{1,30}$/.test(slug)) {
        console.error(
          'Usage: inspower client new <slug> --version <v> [--domain host] [--web-port n --api-port n]',
        );
        return 2;
      }
      const file = clientEnvFile(root, slug);
      const existing = readEnvFile(file);
      const ports =
        existing['WEB_HOST_PORT'] && existing['API_HOST_PORT']
          ? { web: existing['WEB_HOST_PORT'], api: existing['API_HOST_PORT'] }
          : nextHostPorts(
              listClients(root)
                .filter((s) => s !== slug)
                .map((s) => readEnvFile(clientEnvFile(root, s))),
            );
      const gen = (n: number) => require('node:crypto').randomBytes(n).toString('base64url');
      const values: Record<string, string> = {
        CLIENT_SLUG: slug,
        VERSION: flags.opts['version'] ?? existing['VERSION'] ?? 'latest',
        IMAGE: image,
        WEB_ORIGIN: flags.opts['domain']
          ? `https://${flags.opts['domain']}`
          : (existing['WEB_ORIGIN'] ?? 'https://change-me.example'),
        WEB_HOST_PORT: flags.opts['web-port'] ?? ports.web,
        API_HOST_PORT: flags.opts['api-port'] ?? ports.api,
        POSTGRES_PASSWORD: existing['POSTGRES_PASSWORD'] ?? gen(24),
        REDIS_PASSWORD: existing['REDIS_PASSWORD'] ?? gen(24),
        AUTH_ENCRYPTION_KEY:
          existing['AUTH_ENCRYPTION_KEY'] ??
          require('node:crypto').randomBytes(32).toString('base64'),
        BACKUP_ENCRYPTION_KEY:
          existing['BACKUP_ENCRYPTION_KEY'] ??
          require('node:crypto').randomBytes(32).toString('base64'),
        SMTP_HOST: existing['SMTP_HOST'] ?? '',
        SMTP_PORT: existing['SMTP_PORT'] ?? '587',
        SMTP_FROM:
          existing['SMTP_FROM'] ?? `Inspower <no-reply@${flags.opts['domain'] ?? 'example.com'}>`,
      };
      if (!dryRun) for (const [k, v] of Object.entries(values)) writeEnvValue(file, k, v);
      console.log(
        `Client file: ${file}\nKeep AUTH_ENCRYPTION_KEY and BACKUP_ENCRYPTION_KEY in the password manager now; without them the data and the backups cannot be read.`,
      );
      const result = await runSteps(
        spec(slug, values['VERSION']),
        planNewClient(spec(slug, values['VERSION'])),
        dryRun,
      );
      if (!result.ok) return 1;
      console.log(
        `\nLocal ports: web 127.0.0.1:${values['WEB_HOST_PORT']}, API 127.0.0.1:${values['API_HOST_PORT']} (use them in the nginx site).\nNow create the owner: docker compose -p inspower-${slug} --env-file ${file} -f infra/compose/docker-compose.prod.yml run --rm api cli admin create`,
      );
      return 0;
    }
    case 'deploy-all': {
      const version = flags._[0];
      if (!version) {
        console.error('Usage: inspower client deploy-all <version>');
        return 2;
      }
      return releaseCommand([version, '--all', ...(dryRun ? ['--dry-run'] : []), '--image', image]);
    }
    case 'hold': {
      const [slug, state] = flags._;
      if (!slug || (state !== 'on' && state !== 'off')) {
        console.error('Usage: inspower client hold <slug> on|off');
        return 2;
      }
      return (await runSteps(spec(slug), planHold(spec(slug), state === 'on'), dryRun)).ok ? 0 : 1;
    }
    case 'rollback': {
      const slug = flags._[0];
      const to = flags.opts['to'];
      if (!slug || !to) {
        console.error('Usage: inspower client rollback <slug> --to <version>');
        return 2;
      }
      if (!dryRun) writeEnvValue(clientEnvFile(root, slug), 'VERSION', to);
      const c = spec(slug, to);
      return (await runSteps(c, planRelease(c).rollback, dryRun)).ok ? 0 : 1;
    }
    case 'status': {
      const slugs = flags._[0] ? [flags._[0]] : listClients(root);
      if (!slugs.length) console.log(`No clients under ${path.join(root, 'clients')}.`);
      for (const slug of slugs) await runSteps(spec(slug), planStatus(spec(slug)), dryRun);
      return 0;
    }
    default:
      console.error('Usage: inspower client <new|deploy-all|hold|rollback|status> ...');
      return 2;
  }
}

export function orderDemoFirst(slugs: string[]): string[] {
  return [...slugs.filter((s) => s === 'demo'), ...slugs.filter((s) => s !== 'demo')];
}

function clientsRoot(): string {
  return process.env['INSPOWER_CLIENTS_ROOT'] ?? path.resolve(process.cwd(), '..', '..');
}

function currentSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export interface Flags {
  _: string[];
  opts: Record<string, string>;
}

export function parse(args: string[]): Flags {
  const out: Flags = { _: [], opts: {} };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out.opts[a.slice(2)] = next;
        i += 1;
      } else out.opts[a.slice(2)] = '';
    } else out._.push(a);
  }
  return out;
}
