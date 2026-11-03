import type { Request } from 'express';
import type { SessionStage } from '@inspower/shared';

/** What the access guard attaches to a request once a session is accepted. */
export interface AuthContext {
  sessionId: string;
  stage: SessionStage;
  organizationId: string;
  userId: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  permissions: ReadonlySet<string>;
  setupComplete: boolean;
  /** Location scoping inputs (see scoped.ts) */
  restrictedLocationIds: readonly string[];
  assignmentLocationIds: readonly (string | null)[];
}

export type AuthenticatedRequest = Request & { auth?: AuthContext; requestId?: string };

export function authOf(req: Request): AuthContext {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) throw new Error('No session on this request; is the route marked @SignedIn()?');
  return auth;
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function userAgentOf(req: Request): string | null {
  const ua = req.header('user-agent');
  return ua ? ua.slice(0, 512) : null;
}
