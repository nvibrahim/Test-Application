import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { SetupWizard } from '@/features/setup/setup-wizard';
import { apiServer } from '@/lib/api';
import { cookieHeader, requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Set up' };
export const dynamic = 'force-dynamic';

const referenceSchema = z.object({
  countries: z.array(
    z.object({ code: z.string(), name: z.string(), currencyCode: z.string().nullable() }),
  ),
  currencies: z.array(
    z.object({ code: z.string(), name: z.string(), symbol: z.string().nullable() }),
  ),
  timeZones: z.array(z.string()),
});

export default async function SetupPage() {
  const session = await requireSession({ allowDuringSetup: true });
  if (session.setupComplete) redirect('/dashboard');
  if (!session.user.isSuperAdmin) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Nearly ready</h1>
        <p className="text-sm text-muted-foreground">
          A Super Admin still has to finish setting up the organization. Try again later.
        </p>
      </>
    );
  }
  const reference = await apiServer('/setup/reference', referenceSchema, {
    cookie: await cookieHeader(),
  });
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Set up your organization</h1>
      <SetupWizard reference={reference} fullName={session.user.fullName} />
    </>
  );
}
