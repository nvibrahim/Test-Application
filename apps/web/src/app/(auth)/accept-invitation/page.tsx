import type { Metadata } from 'next';
import Link from 'next/link';
import { invitationPreviewSchema } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { AcceptInvitationForm } from '@/features/auth/accept-invitation-form';
import { apiServer } from '@/lib/api';

export const metadata: Metadata = { title: 'Accept your invitation' };
export const dynamic = 'force-dynamic';

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const preview = token
    ? await apiServer(`/invitations/${encodeURIComponent(token)}`, invitationPreviewSchema).catch(
        () => null,
      )
    : null;
  if (!token || !preview) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">This link is not valid</h1>
        <Alert variant="destructive">
          <AlertDescription>
            The invitation link has expired or was replaced. Ask the person who invited you to send
            a new one, or{' '}
            <Link href="/sign-in" className="underline">
              sign in
            </Link>{' '}
            if you already have an account.
          </AlertDescription>
        </Alert>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Welcome, {preview.fullName.split(' ')[0]}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        You have been invited to <strong>{preview.organizationName}</strong> as {preview.email}.
        Choose a password to finish. You can add two-step verification after your first sign-in.
      </p>
      <AcceptInvitationForm token={token} email={preview.email} fullName={preview.fullName} />
    </>
  );
}
