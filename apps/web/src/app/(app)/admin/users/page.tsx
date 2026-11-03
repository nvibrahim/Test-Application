import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { locationsResponseSchema, rolesResponseSchema, userListSchema } from '@inspower/shared';
import { cn } from '@inspower/ui/lib/utils';
import { InviteDialog } from '@/features/users/invite-dialog';
import { UsersTable } from '@/features/users/users-table';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.users.title };
export const dynamic = 'force-dynamic';

const statusFilters = [
  { key: 'all', label: 'Everyone' },
  { key: 'active', label: 'Active' },
  { key: 'invited', label: 'Invited' },
  { key: 'disabled', label: 'Disabled' },
] as const;
const twoFactorFilters = [
  { key: 'all', label: 'Any' },
  { key: 'on', label: 'Two-step on' },
  { key: 'off', label: 'Two-step off' },
] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ twoFactor?: string; status?: string; q?: string }>;
}) {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('users.read')) redirect('/dashboard');
  const params = await searchParams;
  const twoFactor = twoFactorFilters.some((f) => f.key === params.twoFactor)
    ? (params.twoFactor as 'all' | 'on' | 'off')
    : 'all';
  const status = statusFilters.some((f) => f.key === params.status)
    ? (params.status as 'all' | 'active' | 'invited' | 'disabled')
    : 'all';
  const query = new URLSearchParams({ twoFactor, status, ...(params.q ? { q: params.q } : {}) });
  const cookie = await cookieHeader();
  const [list, roles, locations] = await Promise.all([
    apiServer(`/users?${query}`, userListSchema, { cookie }),
    may('users.invite')
      ? apiServer('/roles', rolesResponseSchema, { cookie }).catch(() => null)
      : Promise.resolve(null),
    may('users.invite')
      ? apiServer('/locations', locationsResponseSchema, { cookie }).catch(() => ({
          locations: [],
        }))
      : Promise.resolve({ locations: [] }),
  ]);
  const hrefFor = (patch: Record<string, string>) => ({
    pathname: '/admin/users',
    query: { twoFactor, status, ...(params.q ? { q: params.q } : {}), ...patch },
  });

  return (
    <Page title={appRoutes.users.title} fullName={session.user.fullName}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <nav aria-label="Status" className="flex gap-1 rounded-md border p-1">
            {statusFilters.map((f) => (
              <Link
                key={f.key}
                href={hrefFor({ status: f.key })}
                aria-current={status === f.key ? 'page' : undefined}
                className={cn(
                  'rounded px-3 py-1.5 text-sm',
                  status === f.key
                    ? 'bg-accent font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Two-step verification" className="flex gap-1 rounded-md border p-1">
            {twoFactorFilters.map((f) => (
              <Link
                key={f.key}
                href={hrefFor({ twoFactor: f.key })}
                aria-current={twoFactor === f.key ? 'page' : undefined}
                className={cn(
                  'rounded px-3 py-1.5 text-sm',
                  twoFactor === f.key
                    ? 'bg-accent font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex gap-2" role="search">
            <input type="hidden" name="twoFactor" value={twoFactor} />
            <input type="hidden" name="status" value={status} />
            <input
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search name or email"
              aria-label="Search people"
              className="min-h-10 rounded-md border bg-background px-3 text-sm md:min-h-9"
            />
          </form>
          {roles ? <InviteDialog roles={roles.roles} locations={locations.locations} /> : null}
        </div>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {list.total} {list.total === 1 ? 'person' : 'people'}.
      </p>
      <UsersTable users={list.users} canManage={may('users.manage')} selfId={session.user.id} />
    </Page>
  );
}
