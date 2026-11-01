import { describe, expect, it } from 'vitest';
import { defineRoute, navigationFor } from './routes';

describe('route metadata', () => {
  it('refuses an empty title or a relative path', () => {
    expect(() => defineRoute({ path: '/x', title: '' })).toThrow();
    expect(() => defineRoute({ path: 'x', title: 'X' })).toThrow();
  });
  it('generates navigation from permissions, in order', () => {
    const viewer = navigationFor({ permissions: [], isSuperAdmin: false }).map((r) => r.path);
    expect(viewer).toEqual(['/dashboard', '/profile']);
    const admin = navigationFor({ permissions: [], isSuperAdmin: true }).map((r) => r.path);
    expect(admin).toEqual(['/dashboard', '/admin/users', '/health', '/profile']);
    const withPermission = navigationFor({ permissions: ['system.read'], isSuperAdmin: false }).map(
      (r) => r.path,
    );
    expect(withPermission).toContain('/health');
  });
});
