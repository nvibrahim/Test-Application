import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter your email and we will send a link to choose a new one.
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
