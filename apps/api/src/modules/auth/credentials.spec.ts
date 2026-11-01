import { describe, expect, it } from 'vitest';
import { nextFor, passwordExpired } from './credentials.service';

describe('the session stage machine', () => {
  it('sends each stage to its screen; active goes to setup until the organization exists', () => {
    expect(nextFor('verify_two_factor', true)).toBe('/two-factor');
    expect(nextFor('change_password', false)).toBe('/change-password');
    expect(nextFor('active', false)).toBe('/setup');
    expect(nextFor('active', true)).toBe('/dashboard');
  });
  it('expires a password only when expiry is on', () => {
    expect(passwordExpired(new Date(0), 0)).toBe(false);
    expect(passwordExpired(new Date(0), 90)).toBe(true);
    expect(passwordExpired(new Date(), 90)).toBe(false);
    expect(passwordExpired(null, 90)).toBe(true);
  });
});
