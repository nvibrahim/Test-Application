import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { jobsResponseSchema, scheduledJobsResponseSchema } from '@inspower/shared';
import { JobsScreen } from '@/features/operations/jobs-screen';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.jobs.title };
export const dynamic = 'force-dynamic';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; status?: string; tab?: string }>;
}) {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('system.read')) redirect('/dashboard');
  const { queue, status, tab } = await searchParams;
  const cookie = await cookieHeader();
  const params = new URLSearchParams();
  if (queue) params.set('queue', queue);
  if (status) params.set('status', status);
  const [jobs, scheduled] = await Promise.all([
    apiServer(`/jobs?${params.toString()}`, jobsResponseSchema, { cookie }),
    apiServer('/jobs/scheduled', scheduledJobsResponseSchema, { cookie }),
  ]);
  return (
    <Page title={appRoutes.jobs.title} fullName={session.user.fullName}>
      <JobsScreen
        data={jobs}
        scheduled={scheduled.jobs}
        filters={{ queue: queue ?? '', status: status ?? '' }}
        tab={tab === 'scheduled' ? 'scheduled' : 'queues'}
        canManage={may('jobs.manage')}
      />
    </Page>
  );
}
