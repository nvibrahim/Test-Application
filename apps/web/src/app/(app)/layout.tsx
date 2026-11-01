import { twoFactorStatusSchema } from '@inspower/shared';
import { StepUpProvider } from '@/features/two-factor/step-up-dialog';
import { apiServer } from '@/lib/api';
import { navigationFor } from '@/lib/routes';
import { appName } from '@/lib/brand';
import { cookieHeader, requireSession } from '@/lib/session';
import { IdleBanner } from '@/shell/idle-banner';
import { BottomBar, Sidebar } from '@/shell/nav';
import { TwoFactorReminder } from '@/shell/two-factor-reminder';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const items = navigationFor({
    permissions: session.user.permissions,
    isSuperAdmin: session.user.isSuperAdmin,
  });
  const twoFactor = await apiServer('/two-factor', twoFactorStatusSchema, {
    cookie: await cookieHeader(),
  }).catch(() => null);
  return (
    <StepUpProvider twoFactorEnabled={session.user.twoFactorEnabled}>
      <div className="flex min-h-dvh">
        <Sidebar items={items} appName={appName()} />
        <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
          <IdleBanner
            idleExpiresAt={session.idleExpiresAt}
            warningMinutes={session.warningMinutes}
          />
          {twoFactor?.reminder.show ? (
            <TwoFactorReminder intervalDays={twoFactor.reminder.intervalDays} />
          ) : null}
          {children}
        </div>
        <BottomBar items={items} />
      </div>
    </StepUpProvider>
  );
}
