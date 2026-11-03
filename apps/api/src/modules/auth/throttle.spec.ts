import { describe, expect, it } from 'vitest';
import { defaultSecuritySettings } from '@inspower/shared';
import { ThrottleService } from './throttle.service';

const redisDown = {
  client: {
    multi: () => {
      throw new Error('down');
    },
    get: async () => {
      throw new Error('down');
    },
  },
};

describe('ThrottleService', () => {
  it('grows the delay after the threshold and caps it', () => {
    const t = new ThrottleService(redisDown as never);
    expect(t.delayFor(4, defaultSecuritySettings)).toBe(0);
    expect(t.delayFor(5, defaultSecuritySettings)).toBe(1000);
    expect(t.delayFor(7, defaultSecuritySettings)).toBe(4000);
    expect(t.delayFor(20, defaultSecuritySettings)).toBe(8000);
  });

  it('fails closed when Redis is unavailable', async () => {
    const t = new ThrottleService(redisDown as never);
    await expect(t.checkIp('1.2.3.4', defaultSecuritySettings)).rejects.toMatchObject({
      code: 'temporarily_unavailable',
    });
    await expect(t.emailAttempts('a@b.c')).rejects.toMatchObject({
      code: 'temporarily_unavailable',
    });
  });
});
