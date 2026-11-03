import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Profile } from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { notFound } from '../../platform/http/api-error';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { AuthActions } from './auth.actions';
import { ctxOf } from './credentials.service';
import { SessionsService } from './sessions.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly sessions: SessionsService,
  ) {}

  async me(auth: AuthContext): Promise<Profile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: { preferences: true, twoFactor: { select: { confirmedAt: true } } },
    });
    const p = user.preferences;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isSuperAdmin: auth.isSuperAdmin,
      twoFactorEnabled: user.twoFactor?.confirmedAt != null,
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
      preferences: {
        theme: (p?.theme as Profile['preferences']['theme']) ?? 'system',
        density: (p?.density as Profile['preferences']['density']) ?? 'comfortable',
        timeZone: p?.timeZone ?? null,
        dateFormat: p?.dateFormat ?? null,
      },
    };
  }

  async updatePersonal(
    req: Request,
    auth: AuthContext,
    input: { fullName: string },
  ): Promise<Profile> {
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { fullName: true },
      });
      await tx.user.update({
        where: { id: auth.userId },
        data: { fullName: input.fullName, updatedBy: auth.userId, version: { increment: 1 } },
      });
      await audit({
        action: AuthActions.profileUpdated,
        entityType: 'user',
        entityId: auth.userId,
        changes: { before, after: { fullName: input.fullName } },
      });
    });
    return this.me(auth);
  }

  async updatePreferences(
    req: Request,
    auth: AuthContext,
    input: Partial<Profile['preferences']>,
  ): Promise<Profile> {
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      await tx.userPreferences.upsert({
        where: { userId: auth.userId },
        update: data,
        create: { userId: auth.userId, organizationId: auth.organizationId, ...data },
      });
      await audit({
        action: AuthActions.preferencesUpdated,
        entityType: 'user_preferences',
        entityId: auth.userId,
        changes: { after: data },
      });
    });
    return this.me(auth);
  }

  listSessions(auth: AuthContext) {
    return this.sessions.listForUser(auth.userId, auth.sessionId);
  }

  async revokeSession(req: Request, auth: AuthContext, sessionId: string): Promise<void> {
    const row = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: auth.userId, revokedAt: null },
      select: { id: true },
    });
    if (!row) throw notFound('Session not found');
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await this.sessions.revoke(sessionId, 'revoked_by_user', tx);
      await audit({
        action: AuthActions.sessionRevoked,
        entityType: 'session',
        entityId: sessionId,
      });
      await emit({
        name: 'auth.session.revoked',
        channels: [`session:${sessionId}`],
        payload: { sessionId },
      });
    });
  }

  async signOutOthers(req: Request, auth: AuthContext): Promise<{ revoked: number }> {
    let revoked = 0;
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      revoked = await this.sessions.revokeAllForUser(
        tx,
        auth.userId,
        'revoked_by_user',
        auth.sessionId,
      );
      await audit({
        action: AuthActions.otherSessionsRevoked,
        entityType: 'user',
        entityId: auth.userId,
        changes: { revoked },
      });
      await emit({
        name: 'auth.session.others_revoked',
        channels: [`user:${auth.userId}`],
        payload: { keep: auth.sessionId },
      });
    });
    return { revoked };
  }
}
