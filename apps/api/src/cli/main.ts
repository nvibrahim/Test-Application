import 'reflect-metadata';
import { loadDotEnv } from '../platform/config/dotenv';
loadDotEnv();
import { randomBytes } from 'node:crypto';
import { loadEnv, InvalidEnvironmentError } from '../platform/config/config';
import { createPrismaClient } from '../platform/database/prisma.service';
import { adminCommand } from './admin';
import { backupCommand } from './backup';

/**
 * `pnpm inspower <command>`: the cross-platform command line that replaces scripts.
 * Phase 0 commands: `keys generate`, `db check`, `version`. Phase 1 adds `admin create`
 * and `admin recover`; Phase 6 adds `backup run|restore|verify`; Phase 7 the client and
 * release commands.
 */
const commands: Record<string, (args: string[]) => Promise<number>> = {
  admin(args) {
    return adminCommand(loadEnv(), args);
  },

  backup(args) {
    return backupCommand(loadEnv(), args);
  },

  async version() {
    console.log(process.env['APP_VERSION'] ?? 'dev');
    return 0;
  },

  async keys(args) {
    if (args[0] !== 'generate') {
      console.error('Usage: inspower keys generate');
      return 2;
    }
    console.log(`AUTH_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
    console.log(`BACKUP_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
    return 0;
  },

  async db(args) {
    if (args[0] !== 'check') {
      console.error('Usage: inspower db check');
      return 2;
    }
    const env = loadEnv();
    const prisma = createPrismaClient(env.DATABASE_URL);
    try {
      const rows = await prisma.$queryRaw<{ name: string }[]>`
        SELECT migration_name AS name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
      console.log(`Database reachable. Latest migration: ${rows[0]?.name ?? 'none'}`);
      return 0;
    } finally {
      await prisma.$disconnect();
    }
  },
};

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const command = name ? commands[name] : undefined;
  if (!command) {
    console.error(`Usage: inspower <${Object.keys(commands).join('|')}> ...`);
    return 2;
  }
  return command(rest);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof InvalidEnvironmentError ? error.message : error);
    process.exit(1);
  });
