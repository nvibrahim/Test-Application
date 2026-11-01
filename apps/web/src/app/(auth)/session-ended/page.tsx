import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@inspower/ui/components/button';

export const metadata: Metadata = { title: 'Session ended' };

export default function SessionEndedPage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">You were signed out</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Your session ended after a period of inactivity, or was signed out from another device.
      </p>
      <Button asChild className="w-full">
        <Link href="/sign-in">Sign in again</Link>
      </Button>
    </>
  );
}
