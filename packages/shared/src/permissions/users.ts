import type { PermissionDefinition } from './index.js';

export const usersPermissions: PermissionDefinition[] = [
  {
    key: 'users.read',
    module: 'users',
    label: 'View users',
    description:
      'The list of people, their roles, locations and whether two-step verification is on.',
  },
  {
    key: 'users.invite',
    module: 'users',
    label: 'Invite users',
    description: 'Invite people and send them a new link.',
  },
  {
    key: 'users.manage',
    module: 'users',
    label: 'Manage users',
    description:
      'Change roles and locations, disable, enable, anonymise, reset two-step verification.',
  },
  {
    key: 'users.superadmin.manage',
    module: 'users',
    label: 'Make or remove Super Admins',
    description: 'Reserved to the Super Admin.',
    superAdminOnly: true,
  },
  {
    key: 'roles.read',
    module: 'roles',
    label: 'View roles',
    description: 'Roles and the permission matrix.',
  },
  {
    key: 'roles.manage',
    module: 'roles',
    label: 'Manage roles',
    description:
      'Create, edit and delete roles and their permissions. Reserved to the Super Admin.',
    superAdminOnly: true,
  },
];
