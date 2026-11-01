import { organizationPermissions } from './organization.js';
import { systemPermissions } from './system.js';
import { usersPermissions } from './users.js';

/**
 * The permission registry. Keys are `resource.action`; the core has about 25. Each module adds
 * its slice in its own file and lists it here. The API syncs the registry to the database at
 * start; `renames.ts` carries key changes. Keys marked `superAdminOnly` are reserved: they can
 * never be given to another role.
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
  ...usersPermissions,
  ...organizationPermissions,
  ...systemPermissions,
];

export const permissionKeys = permissionRegistry.map((p) => p.key);

export type PermissionKey = (typeof permissionKeys)[number];

export const permissionKeyPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isPermissionKey(value: string): value is PermissionKey {
  return (permissionKeys as string[]).includes(value);
}

export const reservedPermissionKeys = permissionRegistry
  .filter((p) => p.superAdminOnly)
  .map((p) => p.key);

export const permissionModuleLabels: Record<string, string> = {
  users: 'Users',
  roles: 'Roles',
  organization: 'Organization',
  settings: 'Settings',
  audit: 'Audit log',
  backups: 'Backups',
  notifications: 'Notifications',
  system: 'System',
};

export * from './renames.js';
export {
  ADMINISTRATOR_ROLE_KEY,
  MEMBER_ROLE_KEY,
  SUPER_ADMIN_ROLE_KEY,
  VIEWER_ROLE_KEY,
} from './system.js';
export * from './roles.js';
