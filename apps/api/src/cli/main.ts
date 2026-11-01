import 'reflect-metadata';
import { loadDotEnv } from '../platform/config/dotenv';
loadDotEnv();
import { loadEnv, InvalidEnvironmentError } from '../platform/config/config';
import { createPrismaClient } from '../platform/database/prisma.service';
import { adminCommand } from './admin';
import { backupCommand } from './backup';
import { keysCommand } from './keys';
import { clientCommand, releaseCommand } from './release';
import { maintenanceCommand } from './maintenance';

/**
 * `pnpm inspower <command>`: the cross-platform command line that replaces scripts.
 * Commands: `version`, `db check`, `keys generate|rotate`, `admin create|recover`,
 * `backup run|list|verify|prune|restore`, `maintenance on|off`, `release`, `client`.
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

  keys(args) {
    return keysCommand(args[0] === 'rotate' ? loadEnv() : null, args);
  },

  release(args) {
    return releaseCommand(args);
  },

  client(args) {
    return clientCommand(args);
  },

  maintenance(args) {
    return maintenanceCommand(loadEnv(), args);
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
