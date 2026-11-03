import { describe, expect, it } from 'vitest';
import {
  builtInRoles,
  permissionKeys,
  permissionRegistry,
  reservedPermissionKeys,
} from './index.js';

describe('the permission registry', () => {
  it('has 20 to 40 keys, each unique and well formed', () => {
    expect(permissionKeys.length).toBeGreaterThanOrEqual(20);
    expect(permissionKeys.length).toBeLessThanOrEqual(40);
    expect(new Set(permissionKeys).size).toBe(permissionKeys.length);
  });
  it('reserves exactly the four keys the plan names to the Super Admin', () => {
    expect([...reservedPermissionKeys].sort()).toEqual([
      'backups.restore',
      'roles.manage',
      'settings.security.manage',
      'users.superadmin.manage',
    ]);
  });
  it('built-in role defaults name only existing, non-reserved keys', () => {
    for (const role of builtInRoles) {
      if (role.permissions === '*') continue;
      for (const key of role.permissions) {
        expect(permissionKeys).toContain(key);
        expect(reservedPermissionKeys).not.toContain(key);
      }
    }
    expect(permissionRegistry.find((p) => p.key === 'roles.manage')?.superAdminOnly).toBe(true);
  });
});
