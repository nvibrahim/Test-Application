import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Env } from '../config/config';
import { ENV } from '../config/config.module';
import { PrismaService } from '../database/prisma.service';
import type { EmailTemplate } from '../mail/templates';
import { RedisService } from '../redis/redis.service';

export const QUEUE_NAMES = ['email', 'maintenance', 'backup', 'exports'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export interface EmailJob {
  emailLogId: string;
  organizationId: string;
  to: string;
  template: EmailTemplate;
}

/**
 * Hands work to the background worker. Email: an `email_log` row is written first so the
 * admin screens can show every message and its outcome; the job carries the row id.
 */
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

  async sendEmail(
    organizationId: string,
    to: string,
    template: EmailTemplate,
    subject: string,
  ): Promise<string> {
    const log = await this.prisma.emailLog.create({
      data: { organizationId, toAddress: to, template: template.name, subject, status: 'queued' },
    });
    const job: EmailJob = { emailLogId: log.id, organizationId, to, template };
    try {
      const added = await this.queue('email').add('send', job, { jobId: log.id });
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { jobId: added.id ?? log.id },
      });
    } catch (error) {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      });
    }
    return log.id;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
  }
}
