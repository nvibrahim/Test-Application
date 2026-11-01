import type { Metadata } from 'next';
import { ConfirmEmail } from '@/features/auth/confirm-email';

export const metadata: Metadata = { title: 'Confirm your email' };

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Confirm your new email</h1>
      {token ? (
        <ConfirmEmail token={token} />
      ) : (
        <p className="text-sm text-muted-foreground">This link is missing its token.</p>
      )}
    </>
  );
}
