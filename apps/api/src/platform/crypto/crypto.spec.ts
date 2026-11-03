import { describe, expect, it } from 'vitest';
import {
  hashToken,
  hmacCode,
  keyFingerprint,
  newToken,
  open,
  openText,
  safeEqualHex,
  seal,
  WrongKeyError,
} from './crypto';

const key = Buffer.alloc(32, 7);
const other = Buffer.alloc(32, 8);

describe('seal / open', () => {
  it('round-trips text and carries the key fingerprint', () => {
    const sealed = seal('secret value', key);
    expect(sealed.keyFingerprint).toBe(keyFingerprint(key));
    expect(openText(sealed, key)).toBe('secret value');
  });
  it('uses a fresh nonce each time', () => {
    expect(seal('x', key).value).not.toBe(seal('x', key).value);
  });
  it('names the wrong key before trying to decrypt', () => {
    expect(() => open(seal('x', key), other)).toThrow(WrongKeyError);
  });
  it('refuses a tampered ciphertext', () => {
    const sealed = seal('x', key);
    const [iv, ct, tag] = sealed.value.split('.') as [string, string, string];
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() =>
      open({ ...sealed, value: `${iv}.${flipped.toString('base64')}.${tag}` }, key),
    ).toThrow();
  });
  it('binds additional data', () => {
    const sealed = seal('x', key, 'user:1');
    expect(() => open(sealed, key, 'user:2')).toThrow();
  });
});

describe('tokens and codes', () => {
  it('makes url-safe tokens and stable hashes', () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toHaveLength(64);
  });
  it('hashes a recovery code regardless of spaces, dashes and case', () => {
    expect(hmacCode('abcd-efgh', key)).toBe(hmacCode('ABCD EFGH', key));
    expect(hmacCode('abcd-efgh', key)).not.toBe(hmacCode('abcd-efgh', other));
  });
  it('compares hex in constant time without throwing on length', () => {
    expect(safeEqualHex('00ff', '00ff')).toBe(true);
    expect(safeEqualHex('00ff', '00')).toBe(false);
  });
});
