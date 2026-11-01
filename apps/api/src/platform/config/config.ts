import { z } from 'zod';

const placeholder = /^(change-me|changeme|xxx+|todo|replace.*)$/i;

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, '32 random bytes, base64 encoded');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('Inspower'),
    APP_VERSION: z.string().default('dev'),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    COOKIE_SECURE: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    TRUST_PROXY: z.string().default('loopback'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    REDIS_PREFIX: z.string().min(1).default('inspower'),
    AUTH_ENCRYPTION_KEY: z.string(),
    BACKUP_ENCRYPTION_KEY: z.string(),
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
    SMTP_FROM: z.string().default('Inspower <no-reply@localhost>'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    STORAGE_DIR: z.string().default('./storage'),
    BACKUP_DIR: z.string().default('./backups'),
    /** Folder holding pg_dump and pg_restore; empty means PATH. */
    PG_BIN_DIR: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    const local = env.NODE_ENV !== 'production';
    for (const name of ['AUTH_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY'] as const) {
      const value = env[name];
      if (placeholder.test(value)) {
        if (local) continue; // a placeholder is tolerated only outside production
        ctx.addIssue({ code: 'custom', path: [name], message: 'is still a placeholder' });
        continue;
      }
      const check = base64Key.safeParse(value);
      if (!check.success) {
        ctx.addIssue({ code: 'custom', path: [name], message: 'must be 32 random bytes, base64' });
      }
    }
    if (!local && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super(
      `Invalid environment:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}\n` +
        'Compare .env with .env.example.',
    );
    this.name = 'InvalidEnvironmentError';
  }
}

/** Parses and validates the process environment. Throws a readable error on any problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/**
 * In local development a placeholder key is replaced by a fixed, obviously-local key so
 * the app starts; the startup log says so. Production refuses to boot instead (see above).
 */
export function effectiveKey(
  env: Env,
  name: 'AUTH_ENCRYPTION_KEY' | 'BACKUP_ENCRYPTION_KEY',
): Buffer {
  const value = env[name];
  if (placeholder.test(value)) {
    return Buffer.alloc(32, name === 'AUTH_ENCRYPTION_KEY' ? 0x41 : 0x42);
  }
  return Buffer.from(value, 'base64');
}

export function isPlaceholderKey(value: string): boolean {
  return placeholder.test(value);
}
