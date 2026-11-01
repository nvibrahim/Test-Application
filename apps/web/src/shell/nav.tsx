'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { RouteMeta } from '@/lib/routes';
import { cn } from '@inspower/ui/lib/utils';
import { RouteIcon } from './icons';

/** Desktop and tablet sidebar, generated from the route registry. */
export function Sidebar({ items, appName }: { items: RouteMeta[]; appName: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex"
    >
      <div className="flex h-14 items-center px-5 font-semibold">{appName}</div>
      <ul className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
          return (
            <li key={item.path}>
              <Link
                href={item.path as never}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground',
                  active && 'bg-accent text-accent-foreground',
                )}
              >
                <RouteIcon icon={item.icon} className="size-4" />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Phone bottom bar: the four most used items (plus "More" in later phases). */
export function BottomBar({ items }: { items: RouteMeta[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.slice(0, 4).map((item) => {
          const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
          return (
            <li key={item.path}>
              <Link
                href={item.path as never}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground',
                  active && 'text-primary',
                )}
              >
                <RouteIcon icon={item.icon} className="size-5" />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
