import { describe, expect, it } from 'vitest';
import {
  defaultPasswordRules,
  describePasswordProblem,
  evaluatePassword,
  personalWords,
} from './password-policy.js';

describe('evaluatePassword', () => {
  it('accepts a long phrase of unrelated words', () => {
    const r = evaluatePassword('correct horse battery staple river');
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(3);
  });

  it('refuses fewer than 8 characters', () => {
    const r = evaluatePassword('Ab1!xyz');
    expect(r.problems.some((p) => p.code === 'too_short')).toBe(true);
  });

  it('needs 12 for a Super Admin', () => {
    const r = evaluatePassword('Tr0ub4dor&3', defaultPasswordRules, { isSuperAdmin: true });
    expect(r.problems.some((p) => p.code === 'too_short' && p.minLength === 12)).toBe(true);
  });

  it('refuses a common pattern even when long enough', () => {
    const r = evaluatePassword('Summer2026');
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.code === 'too_weak')).toBe(true);
  });

  it('refuses the email, name, organization and product name inside the password', () => {
    const ctx = {
      email: 'priya.nair@example.com',
      fullName: 'Priya Nair',
      organizationName: 'Northwind Dental',
      appName: 'Inspower',
    };
    expect(personalWords(ctx).sort()).toEqual(['dental', 'inspower', 'nair', 'northwind', 'priya']);
    expect(
      evaluatePassword('Northwind-strong-9988', defaultPasswordRules, ctx).problems.map(
        (p) => p.code,
      ),
    ).toContain('contains_personal');
  });

  it('refuses more than 128 characters', () => {
    expect(evaluatePassword('x'.repeat(129)).problems.some((p) => p.code === 'too_long')).toBe(
      true,
    );
  });

  it('describes every problem in a sentence', () => {
    expect(describePasswordProblem({ code: 'breached' })).toMatch(/breach/);
    expect(describePasswordProblem({ code: 'too_short', minLength: 8 })).toMatch(/8/);
  });
});
