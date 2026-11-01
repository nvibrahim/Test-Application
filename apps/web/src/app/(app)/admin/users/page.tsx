import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { userListSchema } from '@inspower/shared';
import { cn } from '@inspower/ui/lib/utils';
import { UsersTable } from '@/features/users/users-table';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.users.title };
export const dynamic = 'force-dynamic';

const filters = [
  { key: 'all', label: 'Everyone' },
  { key: 'on', label: 'Two-step on' },
  { key: 'off', label: 'Two-step off' },
] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ twoFactor?: string; q?: string }>;
}) {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('users.read')) redirect('/dashboard');
  const params = await searchParams;
  const twoFactor = filters.some((f) => f.key === params.twoFactor)
    ? (params.twoFactor as 'all' | 'on' | 'off')
    : 'all';
  const query = new URLSearchParams({ twoFactor, ...(params.q ? { q: params.q } : {}) });
  const list = await apiServer(`/users?${query}`, userListSchema, { cookie: await cookieHeader() });

  return (
    <Page title={appRoutes.users.title} fullName={session.user.fullName}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter" className="flex gap-1 rounded-md border p-1">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={{
                pathname: '/admin/users',
                query: { ...(params.q ? { q: params.q } : {}), twoFactor: f.key },
              }}
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
        <form className="flex gap-2" role="search">
          <input type="hidden" name="twoFactor" value={twoFactor} />
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search name or email"
            aria-label="Search people"
            className="min-h-10 rounded-md border bg-background px-3 text-sm md:min-h-9"
          />
        </form>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {list.total} {list.total === 1 ? 'person' : 'people'}. Inviting people, roles and
        deactivation arrive with Phase 3.
      </p>
      <UsersTable users={list.users} canManage={may('users.manage')} selfId={session.user.id} />
    </Page>
  );
}
