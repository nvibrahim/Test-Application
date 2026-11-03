import { statfs } from 'node:fs/promises';
import path from 'node:path';
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

  /** The newest completed backup; degraded when none in 26 hours for an organization older than that. */
  private async backup(): Promise<HealthCheck> {
    try {
      const org = await this.prisma.organization.findFirst({
        select: { id: true, createdAt: true },
      });
      if (!org) return { status: 'ok', detail: 'No organization yet' };
      const last = await this.prisma.backup.findFirst({
        where: { organizationId: org.id, status: 'completed' },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      });
      const limit = Date.now() - 26 * 3_600_000;
      const detail = last?.finishedAt
        ? `Last backup ${last.finishedAt.toISOString()}`
        : 'No backup has completed yet';
      if (org.createdAt.getTime() >= limit) return { status: 'ok', detail };
      if (!last?.finishedAt || last.finishedAt.getTime() < limit)
        return { status: 'degraded', detail };
      return { status: 'ok', detail };
    } catch (error) {
      return { status: 'down', detail: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Free space where backups are written: degraded under 10 %, down under 2 %. */
  private async disk(): Promise<HealthCheck> {
    try {
      const dir = path.resolve(this.env.BACKUP_DIR);
      const fs = await statfs(dir).catch(() => statfs(path.dirname(dir)));
      const total = Number(fs.blocks) * Number(fs.bsize);
      const free = Number(fs.bavail) * Number(fs.bsize);
      const pct = total ? Math.round((free / total) * 100) : 100;
      const detail = `${(free / 1_073_741_824).toFixed(1)} GiB free (${pct} %)`;
      if (pct < 2) return { status: 'down', detail };
      if (pct < 10) return { status: 'degraded', detail };
      return { status: 'ok', detail };
    } catch (error) {
      return { status: 'degraded', detail: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Admin only (guarded from Phase 3): every dependency. */
  async details(): Promise<HealthDetails> {
    const [database, redis, worker, mail, backup, disk] = await Promise.all([
      this.database(),
      this.cache(),
      this.worker(),
      this.mailServer(),
      this.backup(),
      this.disk(),
    ]);
    return {
      status: overallStatus([database, redis, worker, mail, backup, disk]),
      version: this.env.APP_VERSION,
      time: new Date().toISOString(),
      checks: { database, redis, worker, mail, backup, disk },
    };
  }
}
