import { Injectable } from '@nestjs/common';
import type { SecuritySettings } from '@inspower/shared';
import { ApiException, temporarilyUnavailable } from '../../platform/http/api-error';
import { RedisService } from '../../platform/redis/redis.service';

/**
 * Brute-force protection. Redis holds the short-lived counters; the database holds the lock
 * (`users.lockedUntil`) and is authoritative. **Fails closed**: if Redis cannot be reached,
 * sign-in answers "temporarily unavailable" rather than skipping the limits.
 */
@Injectable()
export class ThrottleService {
  constructor(private readonly redis: RedisService) {}

  private async count(key: string, windowSeconds: number): Promise<number> {
    try {
      const multi = this.redis.client.multi();
      multi.incr(key);
      multi.expire(key, windowSeconds, 'NX');
      const [count] = (await multi.exec()) ?? [];
      const value = count?.[1];
      if (typeof value !== 'number') throw new Error('Unexpected reply');
      return value;
    } catch {
      throw temporarilyUnavailable('Sign-in is temporarily unavailable. Try again in a moment.');
    }
  }

  private async read(key: string): Promise<number> {
    try {
      const value = await this.redis.client.get(key);
      return value ? Number(value) : 0;
    } catch {
      throw temporarilyUnavailable('Sign-in is temporarily unavailable. Try again in a moment.');
    }
  }

  /** Before verifying anything: is this address blocked? Counts the attempt. */
  async checkIp(ip: string, settings: SecuritySettings): Promise<void> {
    const { perIpAttempts, perIpBlockMinutes, windowMinutes } = settings.lockout;
    const count = await this.count(`throttle:ip:${ip}`, windowMinutes * 60);
    if (count > perIpAttempts) {
      try {
        await this.redis.client.expire(`throttle:ip:${ip}`, perIpBlockMinutes * 60);
      } catch {
        throw temporarilyUnavailable();
      }
      throw new ApiException(
        'rate_limited',
        'Too many attempts from this address. Try again later.',
      );
    }
  }

  /** How many wrong passwords this email has had in the window. */
  emailAttempts(emailNormalized: string): Promise<number> {
    return this.read(`throttle:email:${emailNormalized}`);
  }

  /** Records a wrong password; returns the new count. */
  recordFailure(emailNormalized: string, settings: SecuritySettings): Promise<number> {
    return this.count(`throttle:email:${emailNormalized}`, settings.lockout.windowMinutes * 60);
  }

  async clearFailures(emailNormalized: string): Promise<void> {
    await this.redis.client.del(`throttle:email:${emailNormalized}`).catch(() => undefined);
  }

  /** Growing delay once the threshold is passed: 1 s, 2 s, 4 s, 8 s, capped at 8 s. */
  delayFor(attempts: number, settings: SecuritySettings): number {
    const over = attempts - settings.lockout.delayAfterAttempts;
    if (over < 0) return 0;
    return Math.min(1000 * 2 ** over, 8000);
  }

  /** Password reset requests per email and per address. */
  async checkResetRequest(
    emailNormalized: string,
    ip: string,
    settings: SecuritySettings,
  ): Promise<void> {
    const limit = settings.lockout.resetRequestsPerHour;
    const [byEmail, byIp] = await Promise.all([
      this.count(`throttle:reset:${emailNormalized}`, 3600),
      this.count(`throttle:resetip:${ip}`, 3600),
    ]);
    if (byEmail > limit || byIp > limit * 4) {
      throw new ApiException('rate_limited', 'Too many reset requests. Try again later.');
    }
  }
}
