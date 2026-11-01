import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  APP_SLUG,
  SUPER_ADMIN_ROLE_KEY,
  type SecuritySettings,
  type SessionStage,
} from '@inspower/shared';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { hashToken, newToken } from '../../platform/crypto/crypto';
import { PrismaService, type Tx } from '../../platform/database/prisma.service';
import { RedisService } from '../../platform/redis/redis.service';
import type { AuthContext } from '../access/request-context';
import { OrganizationService } from '../organization/organization.service';

interface CachedSession {
  sessionId: string;
  userId: string;
  stage: SessionStage;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}

const CACHE_SECONDS = 60;
const TOUCH_EVERY_MS = 60_000;

/**
 * Opaque server-side sessions. The token lives only in an HttpOnly cookie and only its SHA-256
 * is stored. Idle and absolute expiry, instant revocation, a short Redis cache for speed.
 */
@Injectable()
export class SessionsService {
  readonly cookieName: string;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly organizations: OrganizationService,
  ) {
    this.cookieName = env.COOKIE_SECURE ? `__Host-${APP_SLUG}_session` : `${APP_SLUG}_session`;
  }

  private cacheKey(tokenHash: string): string {
    return `session:${tokenHash}`;
  }

  /** Creates the row and sets the cookie. Returns the session id. */
  async create(
    tx: Tx,
    res: Response,
    input: {
      organizationId: string;
      userId: string;
      stage: SessionStage;
      rememberMe: boolean;
      ip: string | null;
      userAgent: string | null;
      settings: SecuritySettings;
    },
  ): Promise<{ id: string; idleExpiresAt: Date; absoluteExpiresAt: Date }> {
    const token = newToken(32);
    const now = Date.now();
    const idleExpiresAt = new Date(now + input.settings.session.idleMinutes * 60_000);
    const absoluteMs = input.rememberMe
      ? input.settings.session.rememberMeDays * 86_400_000
      : input.settings.session.absoluteHours * 3_600_000;
    const absoluteExpiresAt = new Date(now + absoluteMs);
    const session = await tx.session.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        tokenHash: hashToken(token),
        stage: input.stage,
        rememberMe: input.rememberMe,
        ip: input.ip,
        userAgent: input.userAgent,
        deviceLabel: deviceLabel(input.userAgent),
        idleExpiresAt,
        absoluteExpiresAt,
      },
    });
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      ...(input.rememberMe ? { maxAge: absoluteMs } : {}),
    });
    return { id: session.id, idleExpiresAt, absoluteExpiresAt };
  }

  clearCookie(res: Response): void {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    });
  }

  tokenFrom(req: Request): string | undefined {
    const value = (req.cookies as Record<string, string | undefined>)[this.cookieName];
    return value && /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : undefined;
  }

  /**
   * Resolves the cookie to a session, checks expiry, touches the idle timer at most once a
   * minute and builds the request's auth context. Returns null for anything not valid.
   */
  async authenticate(req: Request, res: Response): Promise<AuthContext | null> {
    const token = this.tokenFrom(req);
    if (!token) return null;
    const tokenHash = hashToken(token);
    const now = new Date();

    let cached: CachedSession | null = null;
    try {
      const raw = await this.redis.client.get(this.cacheKey(tokenHash));
      if (raw) cached = JSON.parse(raw) as CachedSession;
    } catch {
      cached = null;
    }

    let session = cached;
    if (!session) {
      const row = await this.prisma.session.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          stage: true,
          idleExpiresAt: true,
          absoluteExpiresAt: true,
          revokedAt: true,
        },
      });
      if (!row || row.revokedAt) {
        this.clearCookie(res);
        return null;
      }
      session = {
        sessionId: row.id,
        userId: row.userId,
        stage: row.stage,
        idleExpiresAt: row.idleExpiresAt.toISOString(),
        absoluteExpiresAt: row.absoluteExpiresAt.toISOString(),
      };
    }

    if (new Date(session.idleExpiresAt) <= now || new Date(session.absoluteExpiresAt) <= now) {
      await this.revoke(session.sessionId, 'expired').catch(() => undefined);
      this.clearCookie(res);
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        organizationId: true,
        email: true,
        fullName: true,
        status: true,
        roles: {
          select: {
            role: { select: { key: true, permissions: { select: { permissionKey: true } } } },
          },
        },
      },
    });
    if (!user || user.status !== 'active') {
      await this.revoke(session.sessionId, 'user_not_active').catch(() => undefined);
      this.clearCookie(res);
      return null;
    }

    // Slide the idle window, at most once a minute, and refresh the cache.
    const settings = await this.securitySettings(user.organizationId);
    const idleMs = settings.session.idleMinutes * 60_000;
    const idleExpiresAt = new Date(session.idleExpiresAt);
    if (idleExpiresAt.getTime() - now.getTime() < idleMs - TOUCH_EVERY_MS) {
      const next = new Date(
        Math.min(now.getTime() + idleMs, new Date(session.absoluteExpiresAt).getTime()),
      );
      await this.prisma.session.update({
        where: { id: session.sessionId },
        data: { idleExpiresAt: next, lastSeenAt: now },
      });
      session = { ...session, idleExpiresAt: next.toISOString() };
    }
    await this.redis.client
      .set(this.cacheKey(tokenHash), JSON.stringify(session), 'EX', CACHE_SECONDS)
      .catch(() => undefined);

    const isSuperAdmin = user.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE_KEY);
    const permissions = new Set(
      user.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionKey)),
    );
    const setupComplete = await this.organizations.isSetupComplete(user.organizationId);

    return {
      sessionId: session.sessionId,
      stage: session.stage,
      organizationId: user.organizationId,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      isSuperAdmin,
      permissions,
      setupComplete,
    };
  }

  /** Security settings are read through the SettingsReader, injected lazily to avoid a cycle. */
  securitySettingsLoader: ((organizationId: string) => Promise<SecuritySettings>) | null = null;
  private securitySettings(organizationId: string): Promise<SecuritySettings> {
    if (!this.securitySettingsLoader) throw new Error('Security settings loader not wired');
    return this.securitySettingsLoader(organizationId);
  }

  async current(sessionId: string) {
    return this.prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  }

  async setStage(tx: Tx, sessionId: string, stage: SessionStage): Promise<void> {
    const row = await tx.session.update({
      where: { id: sessionId },
      data: { stage },
      select: { tokenHash: true },
    });
    await this.redis.client.del(this.cacheKey(row.tokenHash)).catch(() => undefined);
  }

  /** Puts the idle timer back to the full window ("Stay signed in"). */
  async extend(
    sessionId: string,
    settings: SecuritySettings,
  ): Promise<{ idleExpiresAt: Date; absoluteExpiresAt: Date }> {
    const row = await this.prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    const next = new Date(
      Math.min(Date.now() + settings.session.idleMinutes * 60_000, row.absoluteExpiresAt.getTime()),
    );
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { idleExpiresAt: next, lastSeenAt: new Date() },
    });
    await this.redis.client.del(this.cacheKey(row.tokenHash)).catch(() => undefined);
    return { idleExpiresAt: next, absoluteExpiresAt: row.absoluteExpiresAt };
  }

  async revoke(
    sessionId: string,
    reason: string,
    tx: Tx | PrismaService = this.prisma,
  ): Promise<void> {
    const row = await tx.session.findUnique({
      where: { id: sessionId },
      select: { tokenHash: true, revokedAt: true },
    });
    if (!row) return;
    if (!row.revokedAt) {
      await tx.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
    }
    await this.redis.client.del(this.cacheKey(row.tokenHash)).catch(() => undefined);
  }

  /** Revokes every live session of a user, optionally keeping one. Returns how many. */
  async revokeAllForUser(
    tx: Tx | PrismaService,
    userId: string,
    reason: string,
    keepSessionId?: string,
  ): Promise<number> {
    const rows = await tx.session.findMany({
      where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
      select: { id: true, tokenHash: true },
    });
    if (!rows.length) return 0;
    await tx.session.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await Promise.all(
      rows.map((r) => this.redis.client.del(this.cacheKey(r.tokenHash)).catch(() => undefined)),
    );
    return rows.length;
  }

  async listForUser(userId: string, currentSessionId: string) {
    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        absoluteExpiresAt: { gt: new Date() },
        idleExpiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, deviceLabel: true, ip: true, createdAt: true, lastSeenAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      current: r.id === currentSessionId,
      deviceLabel: r.deviceLabel,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
    }));
  }
}

/** A short, human label for the device, from the user agent. No fingerprinting. */
export function deviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown device';
  return `${browser} on ${os}`;
}
