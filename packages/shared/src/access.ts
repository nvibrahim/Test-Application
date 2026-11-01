import { z } from 'zod';
import { emailSchema, passwordInputSchema } from './auth.js';

/** Roles, the matrix, users administration and invitations. */

export const roleSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  /** The fixed Super Admin: shown as "All", not editable */
  isFixed: z.boolean(),
  isCustomised: z.boolean(),
  permissions: z.array(z.string()),
  memberCount: z.number().int(),
  version: z.number().int(),
});
export type Role = z.infer<typeof roleSchema>;

export const permissionDefinitionSchema = z.object({
  key: z.string(),
  module: z.string(),
  label: z.string(),
  description: z.string(),
  superAdminOnly: z.boolean(),
});

export const rolesResponseSchema = z.object({
  roles: z.array(roleSchema),
  permissions: z.array(permissionDefinitionSchema),
  modules: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type RolesResponse = z.infer<typeof rolesResponseSchema>;

export const roleNameSchema = z.string().trim().min(2).max(60);
export const createRoleRequestSchema = z.object({
  name: roleNameSchema,
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string()).default([]),
  /** Start from another role's permissions */
  copyFromRoleId: z.string().uuid().optional(),
});
export const updateRoleRequestSchema = z.object({
  name: roleNameSchema.optional(),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string()).optional(),
  version: z.number().int(),
});

/** Users administration */
export const userStatusSchema = z.enum(['invited', 'active', 'disabled', 'anonymised']);

export const roleAssignmentSchema = z.object({
  roleId: z.string().uuid(),
  roleKey: z.string(),
  roleName: z.string(),
  /** null means every location */
  locationId: z.string().uuid().nullable(),
  locationName: z.string().nullable(),
});
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

export const userDetailSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  status: userStatusSchema,
  isSuperAdmin: z.boolean(),
  twoFactorEnabled: z.boolean(),
  mustChangePassword: z.boolean(),
  lockedUntil: z.string().datetime().nullable(),
  lastSignInAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  assignments: z.array(roleAssignmentSchema),
  /** Restricted locations; empty means every location */
  locationIds: z.array(z.string().uuid()),
  invitation: z
    .object({
      expiresAt: z.string().datetime(),
      expired: z.boolean(),
      sentAt: z.string().datetime(),
    })
    .nullable(),
  activeSessions: z.number().int(),
  version: z.number().int(),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

export const assignmentInputSchema = z.object({
  roleId: z.string().uuid(),
  locationId: z.string().uuid().nullable().default(null),
});

export const inviteUserRequestSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1).max(200),
  assignments: z.array(assignmentInputSchema).min(1).max(20),
  locationIds: z.array(z.string().uuid()).max(50).default([]),
});
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;

export const inviteResponseSchema = z.object({
  user: userDetailSchema,
  /** The link, so the inviter can hand it over by another channel while email is not set up */
  link: z.string().url(),
  expiresAt: z.string().datetime(),
});

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordInputSchema,
});
export const invitationPreviewSchema = z.object({
  email: z.string(),
  fullName: z.string(),
  organizationName: z.string(),
  expiresAt: z.string().datetime(),
});

export const updateUserRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  assignments: z.array(assignmentInputSchema).min(1).max(20).optional(),
  locationIds: z.array(z.string().uuid()).max(50).optional(),
  version: z.number().int(),
});

export const userListQuerySchema = z.object({
  twoFactor: z.enum(['all', 'on', 'off']).default('all'),
  status: z.enum(['all', 'invited', 'active', 'disabled']).default('all'),
  roleId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
});

export const auditEntryListSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      actorId: z.string().nullable(),
      actorName: z.string().nullable(),
      entityType: z.string(),
      entityId: z.string().nullable(),
      changes: z.unknown().nullable(),
      ip: z.string().nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
});

/** Self-service email change */
export const emailChangeRequestSchema = z.object({
  newEmail: emailSchema,
  password: passwordInputSchema,
});
export const emailChangeConfirmSchema = z.object({ token: z.string().min(16).max(256) });

export const locationSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isHeadOffice: z.boolean(),
  isActive: z.boolean(),
});
export const locationsResponseSchema = z.object({ locations: z.array(locationSummarySchema) });
