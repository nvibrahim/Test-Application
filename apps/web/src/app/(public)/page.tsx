import Link from 'next/link';
import { Button } from '@inspower/ui/components/button';
import { appName } from '@/lib/brand';
import { getSession, homeFor } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Phase 0 placeholder for the landing page; Phase 5 builds the real one from Settings. */
export default async function HomePage() {
  const session = await getSession();
  const target = session ? homeFor(session.stage, session.setupComplete) : '/sign-in';
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{await appName()}</h1>
      <p className="max-w-prose text-muted-foreground">
        The foundation platform: sign in to manage your organization’s people, settings and records.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={target as never}>{session ? 'Open the app' : 'Sign in'}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/health">System health</Link>
        </Button>
      </div>
    </main>
  );
}
