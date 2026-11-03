import Link from 'next/link';
import { Button } from '@inspower/ui/components/button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The address you opened does not exist.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to the start</Link>
      </Button>
    </main>
  );
}
