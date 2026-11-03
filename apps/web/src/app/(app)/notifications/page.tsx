import type { Metadata } from 'next';
import Link from 'next/link';
import { notificationListSchema } from '@inspower/shared';
import { cn } from '@inspower/ui/lib/utils';
import { NotificationsList } from '@/features/notifications/notifications-list';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.notifications.title };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireSession();
  const { filter } = await searchParams;
  const unreadOnly = filter === 'unread';
  const data = await apiServer(
    `/notifications${unreadOnly ? '?unread=true' : ''}`,
    notificationListSchema,
    { cookie: await cookieHeader() },
  );
  return (
    <Page title={appRoutes.notifications.title} fullName={session.user.fullName}>
      <nav aria-label="Filter" className="mb-4 flex gap-1 rounded-md border p-1 w-fit">
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread' },
        ].map((f) => (
          <Link
            key={f.key}
            href={{ pathname: '/notifications', query: f.key === 'all' ? {} : { filter: f.key } }}
            aria-current={(f.key === 'unread') === unreadOnly ? 'page' : undefined}
            className={cn(
              'rounded px-3 py-1.5 text-sm',
              (f.key === 'unread') === unreadOnly
                ? 'bg-accent font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <NotificationsList notifications={data.notifications} unread={data.unread} />
    </Page>
  );
}
