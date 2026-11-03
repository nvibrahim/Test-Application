import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { locationListSchema } from '@inspower/shared';
import { LocationsList } from '@/features/organization/locations';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.locations.title };
export const dynamic = 'force-dynamic';

export default async function LocationsPage() {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('locations.read')) redirect('/dashboard');
  const data = await apiServer('/locations', locationListSchema, { cookie: await cookieHeader() });
  return (
    <Page title={appRoutes.locations.title} fullName={session.user.fullName}>
      <LocationsList locations={data.locations} canManage={may('locations.manage')} />
    </Page>
  );
}
