import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { backupsResponseSchema, backupTargetsResponseSchema } from '@inspower/shared';
import { BackupsScreen } from '@/features/backups/backups-screen';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.backups.title };
export const dynamic = 'force-dynamic';

export default async function BackupsPage() {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('backups.read')) redirect('/dashboard');
  const cookie = await cookieHeader();
  const [data, targets] = await Promise.all([
    apiServer('/backups', backupsResponseSchema, { cookie }),
    apiServer('/backups/targets', backupTargetsResponseSchema, { cookie }),
  ]);
  return (
    <Page title={appRoutes.backups.title} fullName={session.user.fullName}>
      <BackupsScreen
        backups={data.backups}
        status={data.status}
        targets={targets.targets}
        canRun={may('backups.run')}
        canRestore={session.user.isSuperAdmin}
      />
    </Page>
  );
}
