import { Inject, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { PrismaService } from '../../platform/database/prisma.service';
import { RedisService } from '../../platform/redis/redis.service';

/**
 * Reads one settings section: rows in `app_settings` folded into an object, parsed with the
 * section's Zod schema (which supplies defaults), cached in Redis for a minute under a key
 * that carries the app version, so a cached shape from an older release is never served.
 * Phase 4 adds the writer and the screens; the reader is needed from Phase 1 for Security.
 */
@Injectable()
export class SettingsReader {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private key(organizationId: string, section: string): string {
    return `settings:${this.env.APP_VERSION}:${organizationId}:${section}`;
  }

  async read<T>(organizationId: string, section: string, schema: ZodType<T>): Promise<T> {
    const key = this.key(organizationId, section);
    try {
      const cached = await this.redis.client.get(key);
      if (cached) {
        const parsed = schema.safeParse(JSON.parse(cached));
        if (parsed.success) return parsed.data;
      }
    } catch {
      // the cache is a convenience; fall through to the database
    }
    const rows = await this.prisma.appSetting.findMany({
      where: { organizationId, section },
      select: { key: true, value: true },
    });
    const raw: Record<string, unknown> = {};
    for (const row of rows) raw[row.key] = row.value;
    const parsed = schema.safeParse(raw);
    const value = parsed.success ? parsed.data : schema.parse({});
    try {
      await this.redis.client.set(key, JSON.stringify(value), 'EX', 60);
    } catch {
      // ignore
    }
    return value;
  }

  async invalidate(organizationId: string, section: string): Promise<void> {
    await this.redis.client.del(this.key(organizationId, section)).catch(() => undefined);
  }
}
