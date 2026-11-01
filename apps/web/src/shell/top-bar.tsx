'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { Button } from '@inspower/ui/components/button';
import { api } from '@/lib/api';

export function TopBar({
  title,
  fullName,
  appName,
}: {
  title: string;
  fullName: string;
  appName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await api.post('/auth/sign-out');
    } finally {
      router.push('/sign-in');
      router.refresh();
    }
  }
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <div className="min-w-0">
        <span className="font-semibold md:hidden">{appName}</span>
        <h1 className="truncate text-base font-semibold md:text-lg">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link href="/profile" aria-label={`My profile: ${fullName}`}>
            <UserRound className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{fullName}</span>
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut} disabled={busy} aria-label="Sign out">
          <LogOut className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
