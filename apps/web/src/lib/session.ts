import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionInfoSchema, type SessionInfo, type SessionStage } from '@inspower/shared';
import { ApiRequestError, apiServer } from './api';

/** The incoming Cookie header, rebuilt from Next's cookie store. */
export async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
}

/** Who is signed in, or null. Reading it also slides the idle timer. */
export async function getSession(): Promise<SessionInfo | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    return await apiServer('/auth/session', sessionInfoSchema, { cookie });
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403))
      return null;
    throw error;
  }
}

/** Where a session in a given stage belongs. */
export function homeFor(stage: SessionStage, setupComplete: boolean): string {
  if (stage === 'verify_two_factor') return '/two-factor';
  if (stage === 'change_password') return '/change-password';
  return setupComplete ? '/dashboard' : '/setup';
}

/**
 * The one guard every protected page uses. Redirects to sign-in with no session, to the
 * stage's own screen when the stage is wrong, and to setup until the organization exists.
 */
export async function requireSession(
  options: { stages?: SessionStage[]; allowDuringSetup?: boolean } = {},
): Promise<SessionInfo> {
  const stages = options.stages ?? ['active'];
  const session = await getSession();
  if (!session) redirect('/sign-in');
  if (!stages.includes(session.stage)) redirect(homeFor(session.stage, session.setupComplete));
  if (session.stage === 'active' && !session.setupComplete && !options.allowDuringSetup)
    redirect('/setup');
  return session;
}

/** Sign-in and friends: someone already signed in is sent where they belong. */
export async function redirectIfSignedIn(): Promise<void> {
  const session = await getSession();
  if (session) redirect(homeFor(session.stage, session.setupComplete));
}
