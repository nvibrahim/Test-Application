import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { featureSwitchesResponseSchema, userListSchema } from '@inspower/shared';
import { FeaturesScreen } from '@/features/operations/features-screen';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.features.title };
export const dynamic = 'force-dynamic';

export default async function FeaturesPage() {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('features.manage')) redirect('/dashboard');
  const cookie = await cookieHeader();
  const [features, users] = await Promise.all([
    apiServer('/features', featureSwitchesResponseSchema, { cookie }),
    may('users.read')
      ? apiServer('/users?limit=100', userListSchema, { cookie }).catch(() => null)
      : Promise.resolve(null),
  ]);
  return (
    <Page title={appRoutes.features.title} fullName={session.user.fullName}>
      <FeaturesScreen
        features={features.features}
        people={users?.users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })) ?? []}
      />
    </Page>
  );
}
