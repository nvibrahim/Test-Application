import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Two-step verification' };
export const dynamic = 'force-dynamic';

/** Phase 2 builds this screen; the stage machine already routes here when two-factor is set up. */
export default async function TwoFactorPage() {
  await requireSession({ stages: ['verify_two_factor'], allowDuringSetup: true });
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Two-step verification</h1>
      <p className="text-sm text-muted-foreground">
        Enter the code from your authenticator app. (Arrives with Phase 2.)
      </p>
    </>
  );
}
