import Link from 'next/link';
import { appName } from '@/lib/brand';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="font-semibold">
            {appName()}
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/health" className="text-muted-foreground hover:text-foreground">
              Health
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        {appName()} · Inspower Core
      </footer>
    </div>
  );
}
