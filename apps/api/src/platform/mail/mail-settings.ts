import { emailSettingsSchema, SETTINGS_SECTION_SECURITY } from '@inspower/shared';
import type { PrismaClient } from '../../generated/prisma/client';
import type { Env } from '../config/config';
import { effectiveKey } from '../config/config';
import { openText } from '../crypto/crypto';
import type { Tx } from '../database/prisma.service';
import type { SmtpSettings } from './mail.service';

export const SETTINGS_SECTION_EMAIL = 'email';
void SETTINGS_SECTION_SECURITY;

/**
 * Where mail goes: Settings -> Email when a host is saved there, otherwise the environment
 * (Mailpit locally). The password is sealed in its row and opened only here. Shared by the
 * API (test send) and the worker (every queued email).
 */
export async function resolveSmtp(
  db: PrismaClient | Tx,
  env: Env,
  organizationId: string | null,
): Promise<SmtpSettings> {
  const fromEnv: SmtpSettings = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
    from: env.SMTP_FROM,
  };
  if (!organizationId) return fromEnv;
  const rows = await db.appSetting.findMany({
    where: { organizationId, section: SETTINGS_SECTION_EMAIL },
  });
  if (!rows.length) return fromEnv;
  const raw: Record<string, unknown> = {};
  let sealedPassword: { value: string; keyFingerprint: string } | null = null;
  for (const row of rows) {
    if (row.isSecret) {
      sealedPassword = row.value as { value: string; keyFingerprint: string };
    } else {
      raw[row.key] = row.value;
    }
  }
  const parsed = emailSettingsSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.host) return fromEnv;
  const s = parsed.data;
  const host = parsed.data.host;
  let password: string | undefined;
  if (sealedPassword) {
    try {
      password = openText(
        sealedPassword,
        effectiveKey(env, 'AUTH_ENCRYPTION_KEY'),
        `settings:${organizationId}:email:password`,
      );
    } catch {
      password = undefined;
    }
  }
  const fromAddress = s.fromAddress ?? env.SMTP_FROM.replace(/^.*<([^>]+)>.*$/, '$1');
  return {
    host,
    port: s.port,
    secure: s.security === 'tls',
    user: s.user ?? undefined,
    password,
    from: `${s.fromName} <${fromAddress}>`,
    replyTo: s.replyTo ?? undefined,
    requireTls: s.security === 'starttls',
  };
}
