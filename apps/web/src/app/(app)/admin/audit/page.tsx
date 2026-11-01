import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auditLogResponseSchema } from '@inspower/shared';
import { AuditScreen } from '@/features/operations/audit-screen';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.audit.title };
export const dynamic = 'force-dynamic';

type Params = {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('audit.read')) redirect('/dashboard');
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const k of ['action', 'entityType', 'entityId', 'actorId', 'cursor'] as const)
    if (raw[k]) params.set(k, raw[k]!);
  if (raw.from) params.set('from', new Date(raw.from).toISOString());
  if (raw.to) params.set('to', new Date(`${raw.to}T23:59:59.999Z`).toISOString());
  const cookie = await cookieHeader();
  const data = await apiServer(`/audit?${params.toString()}`, auditLogResponseSchema, { cookie });
  return (
    <Page title={appRoutes.audit.title} fullName={session.user.fullName}>
      <AuditScreen data={data} filters={raw} canExport={may('audit.export')} />
    </Page>
  );
}
