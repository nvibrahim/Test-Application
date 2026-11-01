import Link from 'next/link';
import { Button } from '@inspower/ui/components/button';
import { appName } from '@/lib/brand';

/** Phase 0 placeholder for the landing page; Phase 5 builds the real one from Settings. */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{appName()}</h1>
      <p className="max-w-prose text-muted-foreground">
        The foundation platform is being set up. Phase 0 is in place: database, cache, worker and
        health checks. Sign-in arrives with Phase 1.
      </p>
      <Button asChild>
        <Link href="/health">View system health</Link>
      </Button>
    </main>
  );
}
