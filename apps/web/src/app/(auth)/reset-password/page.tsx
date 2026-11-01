import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        The link works once. Every session will be signed out afterwards.
      </p>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            This link is missing its token.{' '}
            <Link href="/forgot-password" className="underline">
              Ask for a new one.
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
