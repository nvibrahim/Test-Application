'use client';

import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { Button } from '@inspower/ui/components/button';
import { NotificationsBell } from '@/features/notifications/bell';
import { SignOutButton } from './sign-out-button';

export function TopBar({
  title,
  fullName,
  appName,
  unread,
}: {
  title: string;
  fullName: string;
  appName: string;
  unread: number;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b bg-topbar text-topbar-foreground px-4 md:px-6">
      <div className="min-w-0">
        <span className="font-semibold md:hidden">{appName}</span>
        <h1 className="truncate text-base font-semibold md:text-lg">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <NotificationsBell unread={unread} />
        <Button asChild variant="ghost" size="sm">
          <Link href="/profile" aria-label={`My profile: ${fullName}`}>
            <UserRound className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{fullName}</span>
          </Link>
        </Button>
        <SignOutButton compact />
      </div>
    </header>
  );
}
