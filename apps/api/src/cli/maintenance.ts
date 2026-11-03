import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { setMaintenance } from '../modules/backups/engine';
import type { Env } from '../platform/config/config';
import { createPrismaClient } from '../platform/database/prisma.service';
import { createLogger } from '../platform/logging/logger';
import { createRedis } from '../platform/redis/redis.service';

/** `inspower maintenance on [--message text] | off`: the hold switch used by `inspower client hold`. */
export async function maintenanceCommand(env: Env, args: string[]): Promise<number> {
  const [state, ...rest] = args;
  if (state !== 'on' && state !== 'off') {
    console.error('Usage: inspower maintenance on [--message text] | off');
    return 2;
  }
  const idx = rest.indexOf('--message');
  const message = idx >= 0 ? rest[idx + 1] : undefined;
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL, env.REDIS_PREFIX);
  redis.on('error', () => undefined);
  await redis.connect().catch(() => undefined);
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  connection.on('error', () => undefined);
  const emailQueue = new Queue('email', { connection, prefix: `${env.REDIS_PREFIX}:bull` });
  try {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) {
      console.error('No organization yet.');
      return 1;
    }
    await setMaintenance(
      { env, prisma, emailQueue, logger: createLogger('warn', 'cli'), redis },
      org.id,
      state === 'on',
      message,
    );
    console.log(`Maintenance mode is ${state}.`);
    return 0;
  } finally {
    await emailQueue.close().catch(() => undefined);
    await Promise.all([redis.quit(), connection.quit(), prisma.$disconnect()]).catch(
      () => undefined,
    );
  }
}
