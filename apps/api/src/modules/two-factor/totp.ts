import { randomBytes } from 'node:crypto';
import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';

export const TOTP_STEP_SECONDS = 30;
/** ±1 step, as the plan says. */
export const TOTP_TOLERANCE_SECONDS = TOTP_STEP_SECONDS;

export function newTotpSecret(): string {
  return generateSecret({ length: 20 });
}

export function totpUri(secret: string, issuer: string, account: string): string {
  return generateURI({ secret, issuer, label: account, strategy: 'totp' });
}

export interface TotpCheck {
  valid: boolean;
  /** The time step the code belongs to; stored to refuse the same code twice. */
  step: number | null;
}

export function checkTotp(secret: string, code: string, now = Date.now()): TotpCheck {
  const epoch = Math.floor(now / 1000);
  const result = verifySync({
    secret,
    token: code,
    epochTolerance: TOTP_TOLERANCE_SECONDS,
    epoch,
  }) as { valid: boolean; delta?: number };
  if (!result.valid) return { valid: false, step: null };
  return { valid: true, step: Math.floor(epoch / TOTP_STEP_SECONDS) + (result.delta ?? 0) };
}

/** For tests and the CLI only. */
export function currentTotp(secret: string, now = Date.now()): string {
  return generateSync({ secret, epoch: Math.floor(now / 1000) });
}

/** Recovery codes: 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRecoveryCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function formatRecoveryCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => newRecoveryCode());
}
