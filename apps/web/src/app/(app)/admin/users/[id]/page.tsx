import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  auditEntryListSchema,
  locationsResponseSchema,
  rolesResponseSchema,
  userDetailSchema,
} from '@inspower/shared';
import { UserDetailView } from '@/features/users/user-detail';
import { apiServer } from '@/lib/api';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: 'Person' };
export const dynamic = 'force-dynamic';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('users.read')) redirect('/dashboard');
  const { id } = await params;
  const cookie = await cookieHeader();
  const [user, roles, locations, activity] = await Promise.all([
    apiServer(`/users/${id}`, userDetailSchema, { cookie }),
    apiServer('/roles', rolesResponseSchema, { cookie }).catch(() => ({
      roles: [],
      permissions: [],
      modules: [],
    })),
    apiServer('/locations', locationsResponseSchema, { cookie }).catch(() => ({ locations: [] })),
    apiServer(`/users/${id}/activity`, auditEntryListSchema, { cookie }),
  ]);
  return (
    <Page title={user.fullName} fullName={session.user.fullName}>
      <UserDetailView
        user={user}
        roles={roles.roles}
        locations={locations.locations}
        activity={activity}
        can={{
          manage: may('users.manage'),
          invite: may('users.invite'),
          superAdmin: may('users.superadmin.manage'),
        }}
        selfId={session.user.id}
      />
    </Page>
  );
}
