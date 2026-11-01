import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  SUPER_ADMIN_ROLE_KEY,
  type InviteUserRequest,
  type UserDetail,
  type UserListItem,
} from '@inspower/shared';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { hashToken, newToken } from '../../platform/crypto/crypto';
import { PrismaService, type Tx } from '../../platform/database/prisma.service';
import { ApiException, conflict, forbidden, notFound } from '../../platform/http/api-error';
import { QueueService } from '../../platform/jobs/queue.service';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { type AuthContext, clientIp, userAgentOf } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { PasswordsService } from '../auth/passwords.service';
import { SecuritySettingsService } from '../auth/security-settings';
import { SessionsService } from '../auth/sessions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationService } from '../organization/organization.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { UserActions } from './users.actions';

export const INVITATION_HOURS = 72;
export const EMAIL_CHANGE_MINUTES = 60;

type Assignment = { roleId: string; locationId: string | null };

@Injectable()
export class UsersService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly passwords: PasswordsService,
    private readonly sessions: SessionsService,
    private readonly security: SecuritySettingsService,
    private readonly organizations: OrganizationService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  private readonly include = {
    twoFactor: { select: { confirmedAt: true } },
    roles: {
      include: {
        role: { select: { id: true, key: true, name: true } },
        location: { select: { name: true } },
      },
    },
    locations: { select: { locationId: true } },
    invitations: { orderBy: { createdAt: 'desc' as const }, take: 1 },
    _count: {
      select: { sessions: { where: { revokedAt: null, absoluteExpiresAt: { gt: new Date() } } } },
    },
  };

  private toDetail(u: Awaited<ReturnType<typeof this.load>>): UserDetail {
    const inv = u.invitations[0];
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      isSuperAdmin: u.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE_KEY),
      twoFactorEnabled: u.twoFactor?.confirmedAt != null,
      mustChangePassword: u.mustChangePassword,
      lockedUntil: u.lockedUntil?.toISOString() ?? null,
      lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      assignments: u.roles.map((r) => ({
        roleId: r.role.id,
        roleKey: r.role.key,
        roleName: r.role.name,
        locationId: r.locationId,
        locationName: r.location?.name ?? null,
      })),
      locationIds: u.locations.map((l) => l.locationId),
      invitation:
        u.status === 'invited' && inv && !inv.acceptedAt && !inv.revokedAt
          ? {
              expiresAt: inv.expiresAt.toISOString(),
              expired: inv.expiresAt <= new Date(),
              sentAt: inv.createdAt.toISOString(),
            }
          : null,
      activeSessions: u._count.sessions,
      version: u.version,
    };
  }

  private async load(organizationId: string, id: string) {
    const u = await this.prisma.user.findFirst({
      where: { id, organizationId },
      include: this.include,
    });
    if (!u) throw notFound('User not found');
    return u;
  }

  async list(
    auth: AuthContext,
    query: {
      twoFactor: 'all' | 'on' | 'off';
      status: 'all' | 'invited' | 'active' | 'disabled';
      roleId?: string;
      locationId?: string;
      q?: string;
    },
  ): Promise<{ users: UserListItem[]; total: number }> {
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId: auth.organizationId,
        status: query.status === 'all' ? { not: 'anonymised' } : query.status,
        ...(query.q
          ? {
              OR: [
                { fullName: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.twoFactor === 'on' ? { twoFactor: { confirmedAt: { not: null } } } : {}),
        ...(query.twoFactor === 'off'
          ? { OR: [{ twoFactor: null }, { twoFactor: { confirmedAt: null } }] }
          : {}),
        ...(query.roleId ? { roles: { some: { roleId: query.roleId } } } : {}),
        ...(query.locationId
          ? {
              OR: [
                { locations: { some: { locationId: query.locationId } } },
                { roles: { some: { locationId: query.locationId } } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: 'asc' },
      include: {
        twoFactor: { select: { confirmedAt: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
      take: 500,
    });
    return {
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        status: u.status,
        roles: [...new Set(u.roles.map((r) => r.role.name))],
        twoFactorEnabled: u.twoFactor?.confirmedAt != null,
        lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
      total: rows.length,
    };
  }

  async detail(auth: AuthContext, id: string): Promise<UserDetail> {
    return this.toDetail(await this.load(auth.organizationId, id));
  }

  /** Recent audit entries about this person (as actor or as the entity). */
  async activity(auth: AuthContext, id: string) {
    await this.load(auth.organizationId, id);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId: auth.organizationId,
        OR: [{ actorId: id }, { entityType: 'user', entityId: id }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((a): a is string => !!a))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.fullName]));
    return {
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorId: r.actorId,
        actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
        entityType: r.entityType,
        entityId: r.entityId,
        changes: r.changes,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Assignments must name roles of this organization; the Super Admin role is given only through promote(). */
  private async checkAssignments(organizationId: string, assignments: Assignment[]): Promise<void> {
    const roleIds = [...new Set(assignments.map((a) => a.roleId))];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, organizationId },
    });
    if (roles.length !== roleIds.length)
      throw new ApiException('validation_failed', 'Unknown role');
    if (roles.some((r) => r.key === SUPER_ADMIN_ROLE_KEY))
      throw forbidden('Super Admin is given from the Access card, not as an ordinary role');
    const locationIds = [
      ...new Set(assignments.map((a) => a.locationId).filter((l): l is string => !!l)),
    ];
    if (locationIds.length) {
      const n = await this.prisma.location.count({
        where: { id: { in: locationIds }, organizationId },
      });
      if (n !== locationIds.length) throw new ApiException('validation_failed', 'Unknown location');
    }
  }

  private async writeAssignments(
    tx: Tx,
    organizationId: string,
    userId: string,
    assignments: Assignment[],
    keepSuperAdmin: boolean,
    actorId: string,
  ): Promise<void> {
    const superRole = keepSuperAdmin
      ? await tx.role.findUnique({
          where: { organizationId_key: { organizationId, key: SUPER_ADMIN_ROLE_KEY } },
          select: { id: true },
        })
      : null;
    await tx.userRole.deleteMany({
      where: { userId, ...(superRole ? { roleId: { not: superRole.id } } : {}) },
    });
    const seen = new Set<string>();
    for (const a of assignments) {
      const k = `${a.roleId}:${a.locationId ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await tx.userRole.create({
        data: {
          organizationId,
          userId,
          roleId: a.roleId,
          locationId: a.locationId,
          createdBy: actorId,
        },
      });
    }
  }

  async invite(
    req: Request,
    auth: AuthContext,
    input: InviteUserRequest,
  ): Promise<{ user: UserDetail; link: string; expiresAt: string }> {
    await this.checkAssignments(auth.organizationId, input.assignments);
    const existing = await this.prisma.user.findUnique({
      where: {
        organizationId_emailNormalized: {
          organizationId: auth.organizationId,
          emailNormalized: input.email,
        },
      },
    });
    if (existing)
      throw conflict(
        existing.status === 'invited'
          ? 'This person was already invited. Send them a new link from their page.'
          : 'Someone with this email already exists.',
      );
    const token = newToken(32);
    const expiresAt = new Date(Date.now() + INVITATION_HOURS * 3_600_000);
    let userId = '';
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      const user = await tx.user.create({
        data: {
          organizationId: auth.organizationId,
          email: input.email,
          emailNormalized: input.email,
          fullName: input.fullName,
          status: 'invited',
          createdBy: auth.userId,
        },
      });
      userId = user.id;
      await tx.userPreferences.create({
        data: { userId: user.id, organizationId: auth.organizationId },
      });
      await this.writeAssignments(
        tx,
        auth.organizationId,
        user.id,
        input.assignments,
        false,
        auth.userId,
      );
      if (input.locationIds.length)
        await tx.userLocation.createMany({
          data: input.locationIds.map((locationId) => ({
            userId: user.id,
            locationId,
            organizationId: auth.organizationId,
          })),
        });
      await tx.userInvitation.create({
        data: {
          organizationId: auth.organizationId,
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt,
          invitedBy: auth.userId,
        },
      });
      await audit({
        action: UserActions.invited,
        entityType: 'user',
        entityId: user.id,
        changes: {
          after: { email: input.email, fullName: input.fullName, assignments: input.assignments },
        },
      });
      await emit({ name: 'users.user.invited', channels: ['admin'], payload: { id: user.id } });
    });
    const link = `${this.env.WEB_ORIGIN}/accept-invitation?token=${encodeURIComponent(token)}`;
    const org = await this.organizations.current();
    await this.queue.sendEmail(auth.organizationId, input.email, {
      name: 'invitation',
      params: {
        appName: this.env.APP_NAME,
        fullName: input.fullName,
        inviterName: auth.fullName,
        organizationName: org?.tradingName || org?.legalName || this.env.APP_NAME,
        link,
        hours: INVITATION_HOURS,
      },
    });
    return { user: await this.detail(auth, userId), link, expiresAt: expiresAt.toISOString() };
  }

  /** A new link; the old one stops working. */
  async resendInvitation(
    req: Request,
    auth: AuthContext,
    id: string,
  ): Promise<{ link: string; expiresAt: string }> {
    const user = await this.load(auth.organizationId, id);
    if (user.status !== 'invited')
      throw conflict('This person has already accepted their invitation');
    const token = newToken(32);
    const expiresAt = new Date(Date.now() + INVITATION_HOURS * 3_600_000);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.userInvitation.updateMany({
        where: { userId: id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.userInvitation.create({
        data: {
          organizationId: auth.organizationId,
          userId: id,
          tokenHash: hashToken(token),
          expiresAt,
          invitedBy: auth.userId,
        },
      });
      await audit({ action: UserActions.invitationResent, entityType: 'user', entityId: id });
    });
    const link = `${this.env.WEB_ORIGIN}/accept-invitation?token=${encodeURIComponent(token)}`;
    const org = await this.organizations.current();
    await this.queue.sendEmail(auth.organizationId, user.email, {
      name: 'invitation',
      params: {
        appName: this.env.APP_NAME,
        fullName: user.fullName,
        inviterName: auth.fullName,
        organizationName: org?.tradingName || org?.legalName || this.env.APP_NAME,
        link,
        hours: INVITATION_HOURS,
      },
    });
    return { link, expiresAt: expiresAt.toISOString() };
  }

  private async invitationByToken(token: string) {
    const row = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (
      !row ||
      row.acceptedAt ||
      row.revokedAt ||
      row.expiresAt <= new Date() ||
      row.user.status !== 'invited'
    ) {
      throw new ApiException(
        'token_invalid',
        'This invitation link is not valid any more. Ask for a new one.',
      );
    }
    return row;
  }

  /** Public: what the accept page shows before the password is chosen. */
  async previewInvitation(token: string) {
    const row = await this.invitationByToken(token);
    const org = await this.organizations.current();
    return {
      email: row.user.email,
      fullName: row.user.fullName,
      organizationName: org?.tradingName || org?.legalName || this.env.APP_NAME,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /** Public: the person chooses a password and becomes active. They then sign in (and set up two-step verification). */
  async acceptInvitation(req: Request, token: string, password: string): Promise<void> {
    const row = await this.invitationByToken(token);
    const settings = await this.security.read(row.organizationId);
    const org = await this.organizations.current();
    const evaluation = await this.passwords.evaluateForUser(
      password,
      settings.password,
      {
        email: row.user.email,
        fullName: row.user.fullName,
        organizationName: org?.legalName,
        appName: this.env.APP_NAME,
      },
      null,
    );
    if (!evaluation.ok)
      throw new ApiException('password_rejected', 'Choose a stronger password', {
        problems: this.passwords.describe(evaluation),
      });
    const hash = await this.passwords.hash(password);
    await this.transactions.run(
      {
        organizationId: row.organizationId,
        actorId: row.userId,
        ip: clientIp(req),
        userAgent: userAgentOf(req),
      },
      async ({ tx, audit, emit }) => {
        const claimed = await tx.userInvitation.updateMany({
          where: { id: row.id, acceptedAt: null },
          data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new ApiException('token_invalid', 'This invitation was already used.');
        await tx.user.update({
          where: { id: row.userId },
          data: {
            status: 'active',
            passwordHash: hash,
            passwordChangedAt: new Date(),
            mustChangePassword: false,
            version: { increment: 1 },
          },
        });
        await audit({
          action: UserActions.invitationAccepted,
          entityType: 'user',
          entityId: row.userId,
        });
        if (row.invitedBy) {
          await this.notifications.notify(tx, {
            organizationId: row.organizationId,
            userId: row.invitedBy,
            type: 'users.invitation_accepted',
            title: `${row.user.fullName} accepted their invitation`,
            link: `/admin/users/${row.userId}`,
          });
        }
        await emit({
          name: 'users.user.updated',
          channels: ['admin'],
          payload: { id: row.userId },
        });
      },
    );
  }

  async update(
    req: Request,
    auth: AuthContext,
    id: string,
    input: {
      fullName?: string;
      assignments?: Assignment[];
      locationIds?: string[];
      version: number;
    },
  ): Promise<UserDetail> {
    const before = await this.load(auth.organizationId, id);
    if (before.version !== input.version)
      throw conflict('Someone else saved this person first. Reload and try again.');
    if (before.status === 'anonymised') throw conflict('This account was anonymised');
    if (input.assignments) await this.checkAssignments(auth.organizationId, input.assignments);
    const wasSuper = before.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE_KEY);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          version: { increment: 1 },
          updatedBy: auth.userId,
        },
      });
      if (input.assignments) {
        await this.writeAssignments(
          tx,
          auth.organizationId,
          id,
          input.assignments,
          wasSuper,
          auth.userId,
        );
        await audit({
          action: UserActions.rolesChanged,
          entityType: 'user',
          entityId: id,
          changes: {
            before: before.roles.map((r) => ({ role: r.role.key, locationId: r.locationId })),
            after: input.assignments,
          },
        });
      }
      if (input.locationIds) {
        await tx.userLocation.deleteMany({ where: { userId: id } });
        if (input.locationIds.length)
          await tx.userLocation.createMany({
            data: input.locationIds.map((locationId) => ({
              userId: id,
              locationId,
              organizationId: auth.organizationId,
            })),
          });
        await audit({
          action: UserActions.locationsChanged,
          entityType: 'user',
          entityId: id,
          changes: { before: before.locations.map((l) => l.locationId), after: input.locationIds },
        });
      }
      if (input.fullName !== undefined && input.fullName !== before.fullName) {
        await audit({
          action: UserActions.updated,
          entityType: 'user',
          entityId: id,
          changes: { before: { fullName: before.fullName }, after: { fullName: input.fullName } },
        });
      }
      await emit({
        name: 'users.user.updated',
        channels: ['admin', `user:${id}`],
        payload: { id },
      });
    });
    // Permissions changed: the person's cached sessions must be re-read on the next request.
    await this.sessions.dropCacheForUser(id);
    return this.detail(auth, id);
  }

  private async superAdminCount(organizationId: string, excludingUserId?: string): Promise<number> {
    return this.prisma.userRole.count({
      where: {
        organizationId,
        role: { key: SUPER_ADMIN_ROLE_KEY },
        user: { status: 'active', ...(excludingUserId ? { id: { not: excludingUserId } } : {}) },
      },
    });
  }

  /** Disabling signs the person out everywhere at once; history is kept. The last Super Admin cannot be disabled. */
  async setDisabled(
    req: Request,
    auth: AuthContext,
    id: string,
    disabled: boolean,
  ): Promise<UserDetail> {
    const before = await this.load(auth.organizationId, id);
    if (id === auth.userId) throw forbidden('You cannot disable your own account');
    if (before.status === 'anonymised') throw conflict('This account was anonymised');
    if (before.status === 'invited')
      throw conflict(
        'This person has not accepted their invitation yet; cancel it by anonymising instead',
      );
    const isSuper = before.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE_KEY);
    if (disabled && isSuper && (await this.superAdminCount(auth.organizationId, id)) === 0)
      throw new ApiException(
        'last_super_admin',
        'This is the last active Super Admin and cannot be disabled',
      );
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.user.update({
        where: { id },
        data: {
          status: disabled ? 'disabled' : 'active',
          version: { increment: 1 },
          updatedBy: auth.userId,
        },
      });
      if (disabled) await this.sessions.revokeAllForUser(tx, id, 'disabled');
      await audit({
        action: disabled ? UserActions.disabled : UserActions.enabled,
        entityType: 'user',
        entityId: id,
      });
      await emit({
        name: 'users.user.updated',
        channels: ['admin', `user:${id}`],
        payload: { id },
      });
    });
    if (disabled)
      await this.queue.sendEmail(auth.organizationId, before.email, {
        name: 'account-disabled',
        params: { appName: this.env.APP_NAME, fullName: before.fullName },
      });
    return this.detail(auth, id);
  }

  /** GDPR: name and email replaced, sessions revoked, two-factor removed; the audit log keeps the id. */
  async anonymise(req: Request, auth: AuthContext, id: string): Promise<UserDetail> {
    const before = await this.load(auth.organizationId, id);
    if (id === auth.userId) throw forbidden('You cannot anonymise your own account');
    if (before.status === 'anonymised') throw conflict('Already anonymised');
    const isSuper = before.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE_KEY);
    if (
      isSuper &&
      before.status === 'active' &&
      (await this.superAdminCount(auth.organizationId, id)) === 0
    )
      throw new ApiException(
        'last_super_admin',
        'This is the last active Super Admin and cannot be anonymised',
      );
    const short = id.replace(/-/g, '').slice(0, 12);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.user.update({
        where: { id },
        data: {
          status: 'anonymised',
          fullName: 'Former user',
          email: `anonymised-${short}@invalid.local`,
          emailNormalized: `anonymised-${short}@invalid.local`,
          passwordHash: null,
          anonymisedAt: new Date(),
          lockedUntil: null,
          version: { increment: 1 },
          updatedBy: auth.userId,
        },
      });
      await this.sessions.revokeAllForUser(tx, id, 'anonymised');
      await this.twoFactor.removeAll(tx, id);
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userLocation.deleteMany({ where: { userId: id } });
      await tx.userInvitation.updateMany({
        where: { userId: id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: id } });
      await tx.emailChangeToken.deleteMany({ where: { userId: id } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await audit({
        action: UserActions.anonymised,
        entityType: 'user',
        entityId: id,
        changes: { before: { status: before.status } },
      });
      await emit({ name: 'users.user.updated', channels: ['admin'], payload: { id } });
    });
    return this.detail(auth, id);
  }

  /** Super Admin only (reserved permission + step-up). */
  async setSuperAdmin(
    req: Request,
    auth: AuthContext,
    id: string,
    grant: boolean,
  ): Promise<UserDetail> {
    const before = await this.load(auth.organizationId, id);
    if (before.status !== 'active') throw conflict('Only an active person can be a Super Admin');
    const role = await this.prisma.role.findUniqueOrThrow({
      where: {
        organizationId_key: { organizationId: auth.organizationId, key: SUPER_ADMIN_ROLE_KEY },
      },
    });
    const isSuper = before.roles.some((r) => r.roleId === role.id);
    if (grant === isSuper) return this.toDetail(before);
    if (!grant && (await this.superAdminCount(auth.organizationId, id)) === 0)
      throw new ApiException('last_super_admin', 'At least one active Super Admin must remain');
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      if (grant)
        await tx.userRole.create({
          data: {
            organizationId: auth.organizationId,
            userId: id,
            roleId: role.id,
            locationId: null,
            createdBy: auth.userId,
          },
        });
      else await tx.userRole.deleteMany({ where: { userId: id, roleId: role.id } });
      await audit({
        action: grant ? UserActions.superAdminGranted : UserActions.superAdminRemoved,
        entityType: 'user',
        entityId: id,
      });
      await this.notifications.notify(tx, {
        organizationId: auth.organizationId,
        userId: id,
        type: 'users.superadmin_changed',
        title: grant ? 'You are now a Super Admin' : 'You are no longer a Super Admin',
        link: '/dashboard',
      });
      await emit({
        name: 'users.user.updated',
        channels: ['admin', `user:${id}`],
        payload: { id },
      });
    });
    await this.sessions.dropCacheForUser(id);
    return this.detail(auth, id);
  }

  /** Self-service: a confirmation link goes to the new address; the password proves it is the person. */
  async requestEmailChange(
    req: Request,
    auth: AuthContext,
    newEmail: string,
    password: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.passwordHash || !(await this.passwords.verify(user.passwordHash, password)))
      throw new ApiException('invalid_credentials', 'The password is wrong');
    if (newEmail === user.emailNormalized) throw conflict('That is already your email');
    const taken = await this.prisma.user.findUnique({
      where: {
        organizationId_emailNormalized: {
          organizationId: auth.organizationId,
          emailNormalized: newEmail,
        },
      },
    });
    if (taken) throw conflict('Someone with this email already exists');
    const token = newToken(32);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.emailChangeToken.deleteMany({ where: { userId: auth.userId, usedAt: null } });
      await tx.emailChangeToken.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          newEmail,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + EMAIL_CHANGE_MINUTES * 60_000),
        },
      });
      await audit({
        action: UserActions.emailChangeRequested,
        entityType: 'user',
        entityId: auth.userId,
        changes: { after: { newEmail } },
      });
    });
    await this.queue.sendEmail(auth.organizationId, newEmail, {
      name: 'email-change',
      params: {
        appName: this.env.APP_NAME,
        fullName: user.fullName,
        link: `${this.env.WEB_ORIGIN}/confirm-email?token=${encodeURIComponent(token)}`,
        minutes: EMAIL_CHANGE_MINUTES,
      },
    });
  }

  /** Public: the link from the new address. */
  async confirmEmailChange(req: Request, token: string): Promise<{ email: string }> {
    const row = await this.prisma.emailChangeToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.status !== 'active')
      throw new ApiException('token_invalid', 'This link is not valid any more.');
    const taken = await this.prisma.user.findUnique({
      where: {
        organizationId_emailNormalized: {
          organizationId: row.organizationId,
          emailNormalized: row.newEmail,
        },
      },
    });
    if (taken) throw conflict('Someone with this email already exists');
    await this.transactions.run(
      {
        organizationId: row.organizationId,
        actorId: row.userId,
        ip: clientIp(req),
        userAgent: userAgentOf(req),
      },
      async ({ tx, audit }) => {
        const claimed = await tx.emailChangeToken.updateMany({
          where: { id: row.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new ApiException('token_invalid', 'This link was already used.');
        await tx.user.update({
          where: { id: row.userId },
          data: { email: row.newEmail, emailNormalized: row.newEmail, version: { increment: 1 } },
        });
        await audit({
          action: UserActions.emailChanged,
          entityType: 'user',
          entityId: row.userId,
          changes: { before: { email: row.user.email }, after: { email: row.newEmail } },
        });
      },
    );
    await this.sessions.dropCacheForUser(row.userId);
    return { email: row.newEmail };
  }
}
