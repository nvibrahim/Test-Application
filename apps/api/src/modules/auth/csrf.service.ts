import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_SLUG, CSRF_HEADER } from '@inspower/shared';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { ApiException } from '../../platform/http/api-error';

/**
 * Double-submit CSRF: a cookie the browser's JavaScript can read, sent back in a header; plus
 * an Origin (or Referer) check against the web origin. Applied to every state-changing request
 * by the access guard, before the session is even looked at.
 */
@Injectable()
export class CsrfService {
  readonly cookieName: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    // `__Host-` needs Secure; local development over http uses the plain name.
    this.cookieName = env.COOKIE_SECURE ? `__Host-${APP_SLUG}_csrf` : `${APP_SLUG}_csrf`;
  }

  private token(req: Request): string | undefined {
    const value = (req.cookies as Record<string, string | undefined>)[this.cookieName];
    return value && /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : undefined;
  }

  /** Every response carries a token cookie once, so the first form has one to send back. */
  ensureCookie(req: Request, res: Response): string {
    const existing = this.token(req);
    if (existing) return existing;
    const token = randomBytes(32).toString('base64url');
    res.cookie(this.cookieName, token, {
      httpOnly: false,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
    (req.cookies as Record<string, string>)[this.cookieName] = token;
    return token;
  }

  verify(req: Request): void {
    const origin = req.header('origin');
    const referer = req.header('referer');
    const allowed = this.env.WEB_ORIGIN;
    if (origin && origin !== allowed)
      throw new ApiException('csrf_failed', 'This request came from another site');
    if (!origin && referer && !referer.startsWith(`${allowed}/`) && referer !== allowed) {
      throw new ApiException('csrf_failed', 'This request came from another site');
    }
    const cookie = this.token(req);
    const header = req.header(CSRF_HEADER);
    if (
      !cookie ||
      !header ||
      cookie.length !== header.length ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
    ) {
      throw new ApiException('csrf_failed', 'The page is out of date. Reload and try again.');
    }
  }
}
