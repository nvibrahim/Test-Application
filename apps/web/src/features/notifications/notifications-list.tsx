'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Notification } from '@inspower/shared';
import { Button } from '@inspower/ui/components/button';
import { cn } from '@inspower/ui/lib/utils';
import { api } from '@/lib/api';

export function NotificationsList({
  notifications,
  unread,
}: {
  notifications: Notification[];
  unread: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function markAll() {
    setBusy(true);
    await api.post('/notifications/read', { ids: 'all' }).catch(() => undefined);
    setBusy(false);
    router.refresh();
  }
  async function markOne(id: string) {
    await api.post('/notifications/read', { ids: [id] }).catch(() => undefined);
    router.refresh();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{unread ? `${unread} unread` : 'All read'}</p>
        {unread ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={markAll}>
            Mark all as read
          </Button>
        ) : null}
      </div>
      {notifications.length ? (
        <ul className="divide-y rounded-lg border">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={cn(
                'flex flex-wrap items-start justify-between gap-3 p-4 text-sm',
                !n.readAt && 'bg-primary/5',
              )}
            >
              <div className="min-w-0">
                <div className="font-medium">{n.title}</div>
                {n.body ? <div className="text-muted-foreground">{n.body}</div> : null}
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString('en-GB')}
                </div>
              </div>
              <div className="flex gap-2">
                {n.link ? (
                  <Button asChild size="sm" variant="outline" onClick={() => markOne(n.id)}>
                    <Link href={n.link as never}>Open</Link>
                  </Button>
                ) : null}
                {!n.readAt ? (
                  <Button size="sm" variant="ghost" onClick={() => markOne(n.id)}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      )}
    </div>
  );
}
