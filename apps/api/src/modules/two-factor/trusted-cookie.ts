import type { Request } from 'express';
import { APP_SLUG } from '@inspower/shared';
import type { Env } from '../../platform/config/config';

export function trustedCookieName(env: Env): string {
  return env.COOKIE_SECURE ? `__Host-${APP_SLUG}_trusted` : `${APP_SLUG}_trusted`;
}

export function trustedTokenFrom(req: Request, env: Env): string | undefined {
  const value = (req.cookies as Record<string, string | undefined>)[trustedCookieName(env)];
  return value && /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : undefined;
}
