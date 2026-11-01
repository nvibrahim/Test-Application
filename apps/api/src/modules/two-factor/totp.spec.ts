import { describe, expect, it } from 'vitest';
import {
  checkTotp,
  currentTotp,
  formatRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  totpUri,
} from './totp';

describe('TOTP', () => {
  const secret = newTotpSecret();
  it('accepts the current code and the neighbouring steps, refuses two steps away', () => {
    const now = Date.now();
    expect(checkTotp(secret, currentTotp(secret, now), now).valid).toBe(true);
    expect(checkTotp(secret, currentTotp(secret, now - 30_000), now).valid).toBe(true);
    expect(checkTotp(secret, currentTotp(secret, now + 30_000), now).valid).toBe(true);
    expect(checkTotp(secret, currentTotp(secret, now - 90_000), now).valid).toBe(false);
  });
  it('reports the step so a code can be refused the second time', () => {
    const now = Date.now();
    const a = checkTotp(secret, currentTotp(secret, now), now);
    expect(a.step).toBe(Math.floor(now / 30_000));
  });
  it('builds an otpauth uri with issuer and account', () => {
    expect(totpUri(secret, 'Northwind Dental', 'olive@example.test')).toMatch(
      /^otpauth:\/\/totp\/Northwind%20Dental:olive%40example\.test\?secret=/,
    );
  });
});

describe('recovery codes', () => {
  it('makes ten distinct codes from the safe alphabet and formats them in two groups', () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{10}$/);
    expect(formatRecoveryCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
  });
});
