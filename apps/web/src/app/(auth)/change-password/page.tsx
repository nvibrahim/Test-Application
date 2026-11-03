import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Choose your password' };
export const dynamic = 'force-dynamic';

/** The forced step after a first sign-in, a recovery, or an expired password. */
export default async function ChangePasswordPage() {
  const session = await requireSession({ stages: ['change_password'], allowDuringSetup: true });
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Choose your own password</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Welcome, {session.user.fullName}. The password you signed in with was temporary. Choose one
        only you know.
      </p>
      <ChangePasswordForm email={session.user.email} fullName={session.user.fullName} forced />
    </>
  );
}
