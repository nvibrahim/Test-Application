import { describe, expect, it } from 'vitest';
import { effectiveKey, loadEnv } from './config';

const good = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
};

describe('loadEnv', () => {
  it('accepts a complete local environment and applies defaults', () => {
    const env = loadEnv({ ...good });
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('refuses a missing database url with a readable message', () => {
    const { DATABASE_URL: _omit, ...rest } = good;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('tolerates placeholder keys outside production and substitutes a local key', () => {
    const env = loadEnv({ ...good, AUTH_ENCRYPTION_KEY: 'change-me' });
    expect(effectiveKey(env, 'AUTH_ENCRYPTION_KEY')).toHaveLength(32);
  });

  it('refuses to boot in production with a placeholder key', () => {
    expect(() =>
      loadEnv({
        ...good,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        AUTH_ENCRYPTION_KEY: 'change-me',
      }),
    ).toThrow(/AUTH_ENCRYPTION_KEY: is still a placeholder/);
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => loadEnv({ ...good, BACKUP_ENCRYPTION_KEY: 'c2hvcnQ=' })).toThrow(
      /32 random bytes/,
    );
  });

  it('refuses insecure cookies in production', () => {
    expect(() => loadEnv({ ...good, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE/,
    );
  });
});
