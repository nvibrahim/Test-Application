import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Env } from '../config/config';
import { ENV } from '../config/config.module';
import { PrismaService } from '../database/prisma.service';
import type { EmailTemplate } from '../mail/templates';
import { RedisService } from '../redis/redis.service';
import { enqueueEmail } from './email-queue';

export { type EmailJob } from './email-queue';

export const QUEUE_NAMES = ['email', 'maintenance', 'backup', 'exports'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** Hands work to the background worker. */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.redis.queueConnection(),
        prefix: `${this.env.REDIS_PREFIX}:bull`,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 500,
          removeOnFail: 1000,
        },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  /** Every email has an email_log row before it is queued; the worker records the outcome. */
  sendEmail(organizationId: string, to: string, template: EmailTemplate): Promise<string> {
    return enqueueEmail(this.prisma, this.queue('email'), organizationId, to, template);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
  }
}
