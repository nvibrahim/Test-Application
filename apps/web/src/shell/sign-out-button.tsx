'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@inspower/ui/components/button';
import { api } from '@/lib/api';

export function SignOutButton({ compact = false }: { compact?: boolean }) {
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
    <Button
      variant={compact ? 'ghost' : 'outline'}
      size={compact ? 'sm' : 'default'}
      onClick={signOut}
      disabled={busy}
      aria-label="Sign out"
    >
      <LogOut className="size-4" aria-hidden="true" />
      <span className={compact ? 'hidden sm:inline' : ''}>Sign out</span>
    </Button>
  );
}
