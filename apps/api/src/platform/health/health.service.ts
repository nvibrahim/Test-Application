import { Inject, Injectable } from '@nestjs/common';
import { type Health, type HealthCheck, type HealthDetails, overallStatus } from '@inspower/shared';
import type { Env } from '../config/config';
import { ENV } from '../config/config.module';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';

export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
export const WORKER_HEARTBEAT_TTL_SECONDS = 30;

async function timed(run: () => Promise<void>): Promise<HealthCheck> {
  const started = performance.now();
  try {
    await run();
    return { status: 'ok', latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { status: 'down', detail: error instanceof Error ? error.message : String(error) };
  }
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  private database(): Promise<HealthCheck> {
    return timed(async () => {
      await this.prisma.$queryRaw`SELECT 1`;
    });
  }

  private cache(): Promise<HealthCheck> {
    return timed(async () => {
      const pong = await this.redis.client.ping();
      if (pong !== 'PONG') throw new Error('Unexpected reply');
    });
  }

  private async worker(): Promise<HealthCheck> {
    try {
      const beat = await this.redis.client.get(WORKER_HEARTBEAT_KEY);
      if (!beat) return { status: 'degraded', detail: 'No heartbeat from the worker' };
      return { status: 'ok' };
    } catch (error) {
      return { status: 'down', detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private async mailServer(): Promise<HealthCheck> {
    const org = await this.prisma.organization.findFirst({ select: { id: true } });
    const ok = await this.mail.verify(org?.id ?? null);
    return ok ? { status: 'ok' } : { status: 'degraded', detail: 'Mail server not reachable' };
  }

  /** Public and shallow: database and cache only. 200 only when both answer. */
  async shallow(): Promise<Health> {
    const [database, cache] = await Promise.all([this.database(), this.cache()]);
    return {
      status: overallStatus([database, cache]),
      version: this.env.APP_VERSION,
      time: new Date().toISOString(),
    };
  }

  /** Admin only (guarded from Phase 3): every dependency. */
  async details(): Promise<HealthDetails> {
    const [database, redis, worker, mail] = await Promise.all([
      this.database(),
      this.cache(),
      this.worker(),
      this.mailServer(),
    ]);
    return {
      status: overallStatus([database, redis, worker, mail]),
      version: this.env.APP_VERSION,
      time: new Date().toISOString(),
      checks: { database, redis, worker, mail },
    };
  }
}
