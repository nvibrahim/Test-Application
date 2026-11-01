import { navigationFor } from '@/lib/routes';
import { appName } from '@/lib/brand';
import { requireSession } from '@/lib/session';
import { IdleBanner } from '@/shell/idle-banner';
import { BottomBar, Sidebar } from '@/shell/nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const items = navigationFor({
    permissions: session.user.permissions,
    isSuperAdmin: session.user.isSuperAdmin,
  });
  return (
    <div className="flex min-h-dvh">
      <Sidebar items={items} appName={appName()} />
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <IdleBanner idleExpiresAt={session.idleExpiresAt} warningMinutes={session.warningMinutes} />
        {children}
      </div>
      <BottomBar items={items} />
    </div>
  );
}
