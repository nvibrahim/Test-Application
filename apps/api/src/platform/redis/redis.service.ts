import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Env } from '../config/config';
import { ENV } from '../config/config.module';

export function createRedis(url: string, prefix: string): Redis {
  return new Redis(url, {
    keyPrefix: `${prefix}:`,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = createRedis(env.REDIS_URL, env.REDIS_PREFIX);
    // ioredis emits 'error' on every failed reconnect; without a listener Node would exit.
    this.client.on('error', () => undefined);
  }

  /** Connects before the first request is served; a Redis that is down does not stop the boot (health reports it). */
  async onModuleInit(): Promise<void> {
    await this.client.connect().catch(() => undefined);
  }

  /** A second connection for BullMQ, which needs maxRetriesPerRequest = null and no prefix. */
  queueConnection(): Redis {
    return new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: true });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
