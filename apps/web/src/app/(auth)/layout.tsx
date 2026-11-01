import Link from 'next/link';
import { appName } from '@/lib/brand';

/** Sign-in and friends: a single card, a brand panel on wide screens, nothing else. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link href="/" className="text-lg font-semibold">
          {appName()}
        </Link>
        <p className="max-w-sm text-sm opacity-80">
          One place for your organization’s people, settings and records. Protected by your
          password, and by two-step verification when you turn it on.
        </p>
      </aside>
      <main className="flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="text-lg font-semibold">
              {appName()}
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
