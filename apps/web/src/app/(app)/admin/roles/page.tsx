import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { rolesResponseSchema } from '@inspower/shared';
import { RolesMatrix } from '@/features/roles/roles-matrix';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.roles.title };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('roles.read')) redirect('/dashboard');
  const data = await apiServer('/roles', rolesResponseSchema, { cookie: await cookieHeader() });
  return (
    <Page title={appRoutes.roles.title} fullName={session.user.fullName}>
      <RolesMatrix data={data} canManage={may('roles.manage')} />
    </Page>
  );
}
