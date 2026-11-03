import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * AES-256-GCM with a key fingerprint. Used for two-factor secrets, SMTP passwords,
 * backup target configuration and backup files. The fingerprint stored beside a value
 * tells a rotated key apart from a corrupt value before decryption fails.
 */
export interface Sealed {
  /** base64(iv) . base64(ciphertext) . base64(tag) */
  value: string;
  keyFingerprint: string;
}

export function keyFingerprint(key: Buffer): string {
  if (key.length !== 32) throw new Error('A key is 32 bytes');
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function seal(plaintext: string | Buffer, key: Buffer, aad?: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    value: `${iv.toString('base64')}.${ciphertext.toString('base64')}.${tag.toString('base64')}`,
    keyFingerprint: keyFingerprint(key),
  };
}

export class WrongKeyError extends Error {
  constructor(expected: string, actual: string) {
    super(`This value was sealed with key ${expected}; the key in use is ${actual}`);
    this.name = 'WrongKeyError';
  }
}

export function open(sealed: Sealed, key: Buffer, aad?: string): Buffer {
  const fp = keyFingerprint(key);
  if (sealed.keyFingerprint !== fp) throw new WrongKeyError(sealed.keyFingerprint, fp);
  const parts = sealed.value.split('.');
  if (parts.length !== 3) throw new Error('Sealed value is malformed');
  const [iv, ciphertext, tag] = parts.map((p) => Buffer.from(p, 'base64')) as [
    Buffer,
    Buffer,
    Buffer,
  ];
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function openText(sealed: Sealed, key: Buffer, aad?: string): string {
  return open(sealed, key, aad).toString('utf8');
}

/** Tokens (session, reset, invitation, device) are random and stored only as a SHA-256 hash. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Recovery codes are HMAC-hashed with the key so a database copy alone cannot verify them. */
export function hmacCode(code: string, key: Buffer): string {
  return createHmac('sha256', key).update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
