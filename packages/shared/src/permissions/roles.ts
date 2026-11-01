import {
  ADMINISTRATOR_ROLE_KEY,
  MEMBER_ROLE_KEY,
  SUPER_ADMIN_ROLE_KEY,
  VIEWER_ROLE_KEY,
} from './system.js';

/**
 * Built-in roles. The Super Admin is fixed: every permission, now and in the future, not
 * editable. The other three have editable defaults and a "reset to default" button.
 */
export interface BuiltInRole {
  key: string;
  name: string;
  description: string;
  /** `'*'` means every permission, including ones added later. */
  permissions: readonly string[] | '*';
  fixed?: boolean;
}

export const builtInRoles: readonly BuiltInRole[] = [
  {
    key: SUPER_ADMIN_ROLE_KEY,
    name: 'Super Admin',
    description:
      'Every permission, now and in the future. Cannot be edited. Keep for set-up, roles, security settings and restores.',
    permissions: '*',
    fixed: true,
  },
  {
    key: ADMINISTRATOR_ROLE_KEY,
    name: 'Administrator',
    description:
      'Runs the organization day to day: people, locations, settings, audit log, backups.',
    permissions: [
      'users.read',
      'users.invite',
      'users.manage',
      'roles.read',
      'organization.read',
      'organization.manage',
      'locations.read',
      'locations.manage',
      'settings.read',
      'settings.manage',
      'audit.read',
      'audit.export',
      'backups.read',
      'backups.run',
      'notifications.manage',
      'system.read',
      'jobs.manage',
    ],
  },
  {
    key: MEMBER_ROLE_KEY,
    name: 'Member',
    description:
      'Works in the application; sees people and the organization, changes nothing administrative.',
    permissions: ['users.read', 'organization.read', 'locations.read'],
  },
  {
    key: VIEWER_ROLE_KEY,
    name: 'Viewer',
    description: 'Read-only access to what business modules expose. No administration.',
    permissions: [],
  },
];

export const builtInRoleKeys = builtInRoles.map((r) => r.key);
