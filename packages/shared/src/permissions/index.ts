import { systemPermissions } from './system.js';
import { usersPermissions } from './users.js';

/**
 * The permission registry. Keys are `resource.action`; the core targets 25-40 keys.
 * Each module adds its slice in its own file and lists it here. The API syncs the
 * registry to the database at start; `renames.ts` carries key changes.
 */
export interface PermissionDefinition {
  key: string;
  module: string;
  label: string;
  description: string;
  /** Only the fixed Super Admin may hold it; never offered to any other role. */
  superAdminOnly?: boolean;
}

export const permissionRegistry: readonly PermissionDefinition[] = [
  ...systemPermissions,
  ...usersPermissions,
];

export const permissionKeys = permissionRegistry.map((p) => p.key);

export type PermissionKey = (typeof permissionKeys)[number];

export const permissionKeyPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isPermissionKey(value: string): value is PermissionKey {
  return (permissionKeys as string[]).includes(value);
}

export * from './renames.js';
export { SUPER_ADMIN_ROLE_KEY } from './system.js';
