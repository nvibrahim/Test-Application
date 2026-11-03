import { describe, expect, it } from 'vitest';
import { isAuditAction } from './audit.js';
import { outboxEventSchema } from './outbox.js';
import { permissionKeyPattern, permissionRegistry } from './permissions/index.js';

describe('audit action names', () => {
  it('accepts module.entity.action', () => {
    expect(isAuditAction('auth.login.success')).toBe(true);
    expect(isAuditAction('settings.security.updated')).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isAuditAction('login')).toBe(false);
    expect(isAuditAction('Auth.Login.Success')).toBe(false);
    expect(isAuditAction('auth.login')).toBe(false);
  });
});

describe('outbox events', () => {
  it('needs at least one channel and a well-formed name', () => {
    expect(
      outboxEventSchema.safeParse({ name: 'users.user.updated', channels: ['admin'] }).success,
    ).toBe(true);
    expect(outboxEventSchema.safeParse({ name: 'users.user.updated', channels: [] }).success).toBe(
      false,
    );
    expect(outboxEventSchema.safeParse({ name: 'bad', channels: ['admin'] }).success).toBe(false);
  });
});

describe('permission registry', () => {
  it('has unique, well-formed keys', () => {
    const keys = permissionRegistry.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(permissionKeyPattern);
  });
});
