import type { Metadata } from 'next';
import { SignInForm } from '@/features/auth/sign-in-form';
import { redirectIfSignedIn } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  await redirectIfSignedIn();
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Use the email and password you were given.
      </p>
      <SignInForm />
    </>
  );
}
