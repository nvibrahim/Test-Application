import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { parse as parseCookie } from 'cookie';
import { Redis } from 'ioredis';
import { Server, type Socket } from 'socket.io';
import { API_BASE_PATH } from '@inspower/shared';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { hashToken } from '../../platform/crypto/crypto';
import { PrismaService } from '../../platform/database/prisma.service';
import { LOGGER } from '../../platform/logging/logging.module';
import type { Logger } from '../../platform/logging/logger';
import { OUTBOX_CHANNEL } from '../../platform/outbox/outbox';
import { SessionsService } from '../auth/sessions.service';

/**
 * Live updates. The worker publishes outbox events to Redis; this gateway forwards each one
 * only to the rooms it names (`user:<id>`, `session:<id>`, `organization`, `admin`). A browser
 * connects with its session cookie, from our own origin only. The browser then reloads the
 * affected data through the normal API, so every permission check still applies.
 */
@Injectable()
export class RealtimeGateway implements OnModuleDestroy {
  private io: Server | null = null;
  private subscriber: Redis | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly adapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Called from main.ts once the HTTP server exists (tests do not start it). */
  start(): void {
    const httpServer = this.adapterHost.httpAdapter.getHttpServer();
    this.io = new Server(httpServer, {
      path: `${API_BASE_PATH}/realtime`,
      cors: { origin: this.env.WEB_ORIGIN, credentials: true },
      pingInterval: 25_000,
      pingTimeout: 60_000,
      maxHttpBufferSize: 16 * 1024,
    });
    this.io.use(async (socket, next) => {
      try {
        const origin = socket.handshake.headers.origin;
        if (origin && origin !== this.env.WEB_ORIGIN) return next(new Error('origin'));
        const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
        const token = cookies[this.sessions.cookieName];
        if (!token) return next(new Error('unauthenticated'));
        const session = await this.prisma.session.findUnique({
          where: { tokenHash: hashToken(token) },
          select: {
            id: true,
            userId: true,
            stage: true,
            revokedAt: true,
            idleExpiresAt: true,
            absoluteExpiresAt: true,
            organizationId: true,
          },
        });
        if (
          !session ||
          session.revokedAt ||
          session.stage !== 'active' ||
          session.idleExpiresAt <= new Date() ||
          session.absoluteExpiresAt <= new Date()
        )
          return next(new Error('unauthenticated'));
        const user = await this.prisma.user.findUnique({
          where: { id: session.userId },
          select: {
            status: true,
            roles: {
              select: {
                role: { select: { key: true, permissions: { select: { permissionKey: true } } } },
              },
            },
          },
        });
        if (!user || user.status !== 'active') return next(new Error('unauthenticated'));
        const isAdmin = user.roles.some(
          (r) =>
            r.role.key === 'super_admin' ||
            r.role.permissions.some((p) => p.permissionKey === 'notifications.manage'),
        );
        const count = await this.io!.in(`user:${session.userId}`).fetchSockets();
        if (count.length >= 10) return next(new Error('too many connections'));
        socket.data = {
          userId: session.userId,
          sessionId: session.id,
          organizationId: session.organizationId,
          isAdmin,
        };
        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error('failed'));
      }
    });
    this.io.on('connection', (socket: Socket) => {
      const { userId, sessionId, isAdmin } = socket.data as {
        userId: string;
        sessionId: string;
        isAdmin: boolean;
      };
      void socket.join([
        `user:${userId}`,
        `session:${sessionId}`,
        'organization',
        ...(isAdmin ? ['admin'] : []),
      ]);
    });

    this.subscriber = new Redis(this.env.REDIS_URL);
    this.subscriber.on('error', () => undefined);
    void this.subscriber.subscribe(`${this.env.REDIS_PREFIX}:${OUTBOX_CHANNEL}`);
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const event = JSON.parse(raw) as {
          id: string;
          name: string;
          channels: string[];
          payload: unknown;
        };
        for (const room of event.channels)
          this.io
            ?.to(room)
            .emit('event', { id: event.id, name: event.name, payload: event.payload });
        // A revoked session is told to leave at once.
        if (event.name === 'auth.session.revoked' || event.name === 'auth.session.others_revoked') {
          for (const room of event.channels) void this.io?.in(room).disconnectSockets(true);
        }
      } catch (error) {
        this.logger.warn({ err: error }, 'bad outbox message');
      }
    });
    this.logger.info('realtime gateway started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
    await new Promise<void>((resolve) => (this.io ? this.io.close(() => resolve()) : resolve()));
  }
}
