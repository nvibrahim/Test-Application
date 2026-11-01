import 'reflect-metadata';
import { loadDotEnv } from '../platform/config/dotenv';
loadDotEnv();
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv, InvalidEnvironmentError } from '../platform/config/config';
import { createPrismaClient } from '../platform/database/prisma.service';
import {
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SECONDS,
} from '../platform/health/health.service';
import { createLogger } from '../platform/logging/logger';
import { OUTBOX_CHANNEL } from '../platform/outbox/outbox';
import { createRedis } from '../platform/redis/redis.service';
import { emailProcessor } from './email.processor';

export const QUEUES = ['email', 'maintenance', 'backup', 'exports'] as const;
export type QueueName = (typeof QUEUES)[number];

/**
 * The background worker: a separate process from the same image. Phase 0 gives it a
 * heartbeat (read by the health page), the outbox publisher and empty queues. Phase 1
 * adds email sending; later phases add maintenance, backups and exports.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, 'worker');
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL, env.REDIS_PREFIX);
  redis.on('error', (err) => logger.warn({ err }, 'redis error'));
  await redis.connect();
  const publisher = new Redis(env.REDIS_URL);
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const heartbeat = setInterval(() => {
    redis
      .set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), 'EX', WORKER_HEARTBEAT_TTL_SECONDS)
      .catch(() => undefined);
  }, 10_000);
  await redis.set(
    WORKER_HEARTBEAT_KEY,
    new Date().toISOString(),
    'EX',
    WORKER_HEARTBEAT_TTL_SECONDS,
  );

  // Outbox publisher: unpublished events go to Redis pub/sub about every 200 ms.
  let publishing = false;
  const outbox = setInterval(async () => {
    if (publishing) return;
    publishing = true;
    try {
      const events = await prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      for (const event of events) {
        await publisher.publish(
          `${env.REDIS_PREFIX}:${OUTBOX_CHANNEL}`,
          JSON.stringify({
            id: event.id,
            name: event.name,
            channels: event.channels,
            payload: event.payload,
          }),
        );
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
      }
    } catch (err) {
      logger.warn({ err }, 'outbox publish failed; will retry');
    } finally {
      publishing = false;
    }
  }, 200);

  // Queues exist from day one so the jobs screen can show them; processors arrive per phase.
  const queues = QUEUES.map(
    (name) => new Queue(name, { connection, prefix: `${env.REDIS_PREFIX}:bull` }),
  );
  const sendEmail = emailProcessor(env, prisma, logger);
  const workers = QUEUES.map(
    (name) =>
      new Worker(
        name,
        async (job) => {
          if (name === 'email') return sendEmail(job);
          logger.info({ queue: name, job: job.name, id: job.id }, 'no processor for this job yet');
        },
        { connection, prefix: `${env.REDIS_PREFIX}:bull`, concurrency: 2 },
      ),
  );

  logger.info({ queues: QUEUES }, 'worker started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker stopping');
    clearInterval(heartbeat);
    clearInterval(outbox);
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all(queues.map((q) => q.close()));
    await redis.del(WORKER_HEARTBEAT_KEY).catch(() => undefined);
    await Promise.all([
      redis.quit(),
      publisher.quit(),
      connection.quit(),
      prisma.$disconnect(),
    ]).catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error instanceof InvalidEnvironmentError ? error.message : error);
  process.exit(1);
});
