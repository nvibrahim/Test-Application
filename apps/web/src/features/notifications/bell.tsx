'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@inspower/ui/components/button';

export function NotificationsBell({ unread }: { unread: number }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link
        href="/notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
