import { profileSchema, twoFactorStatusSchema } from '@inspower/shared';
import { RealtimeRefresher } from '@/features/notifications/realtime';
import { StepUpProvider } from '@/features/two-factor/step-up-dialog';
import { apiServer, ApiRequestError } from '@/lib/api';
import { navigationFor } from '@/lib/routes';
import { appName, publicSettings } from '@/lib/brand';
import { cookieHeader, requireSession } from '@/lib/session';
import { IdleBanner } from '@/shell/idle-banner';
import { MaintenanceScreen } from '@/shell/maintenance';
import { BottomBar, Sidebar } from '@/shell/nav';
import { TwoFactorReminder } from '@/shell/two-factor-reminder';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const cookie = await cookieHeader();
  const name = await appName();
  // Maintenance mode: the session still answers, everything else says 503. Show the message instead of the app.
  try {
    await apiServer('/profile', profileSchema, { cookie });
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'maintenance') {
      const s = await publicSettings();
      return <MaintenanceScreen message={s.maintenance.message || error.message} appName={name} />;
    }
    throw error;
  }
  const items = navigationFor({
    permissions: session.user.permissions,
    isSuperAdmin: session.user.isSuperAdmin,
  });
  const twoFactor = await apiServer('/two-factor', twoFactorStatusSchema, { cookie }).catch(
    () => null,
  );
  return (
    <StepUpProvider twoFactorEnabled={session.user.twoFactorEnabled}>
      <RealtimeRefresher />
      <div className="flex min-h-dvh">
        <Sidebar items={items} appName={name} />
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
