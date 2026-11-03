import type { Metadata } from 'next';
import { z } from 'zod';
import { VerifyForm } from '@/features/two-factor/verify-form';
import { apiServer } from '@/lib/api';
import { cookieHeader, requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Two-step verification' };
export const dynamic = 'force-dynamic';

const securityPublic = z.object({ trustedDeviceDays: z.number().int() });

export default async function TwoFactorPage() {
  const session = await requireSession({ stages: ['verify_two_factor'], allowDuringSetup: true });
  const settings = await apiServer('/auth/two-factor/settings', securityPublic, {
    cookie: await cookieHeader(),
  }).catch(() => ({ trustedDeviceDays: 30 }));
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Two-step verification</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Welcome back, {session.user.fullName.split(' ')[0]}. Enter the code from your authenticator
        app.
      </p>
      <VerifyForm trustedDeviceDays={settings.trustedDeviceDays} />
    </>
  );
}
