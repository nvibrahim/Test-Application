import { describe, expect, it } from 'vitest';
import {
  recoveryCodeSchema,
  stepUpRequestSchema,
  totpCodeSchema,
  twoFactorVerifyRequestSchema,
} from './two-factor.js';
import { scheduledJobRegistry } from './scheduler.js';

describe('two-factor contracts', () => {
  it('accepts a 6-digit code with spaces and refuses letters', () => {
    expect(totpCodeSchema.parse(' 123 456 ')).toBe('123456');
    expect(totpCodeSchema.safeParse('12345a').success).toBe(false);
  });
  it('normalises a recovery code', () => {
    expect(recoveryCodeSchema.parse('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(recoveryCodeSchema.safeParse('abc').success).toBe(false);
  });
  it('needs exactly one of code or recovery code to verify', () => {
    expect(twoFactorVerifyRequestSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(twoFactorVerifyRequestSchema.safeParse({}).success).toBe(false);
    expect(
      twoFactorVerifyRequestSchema.safeParse({ code: '123456', recoveryCode: 'ABCDEFGHJK' })
        .success,
    ).toBe(false);
  });
  it('needs exactly one of password or code to step up', () => {
    expect(stepUpRequestSchema.safeParse({ password: 'x' }).success).toBe(true);
    expect(stepUpRequestSchema.safeParse({ password: 'x', code: '123456' }).success).toBe(false);
  });
});

describe('scheduled job registry', () => {
  it('has unique keys and five-field crons', () => {
    const keys = scheduledJobRegistry.map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const j of scheduledJobRegistry) expect(j.cron.trim().split(/\s+/)).toHaveLength(5);
  });
});
