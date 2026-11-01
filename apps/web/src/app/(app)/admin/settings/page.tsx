import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  settingsSectionKeys,
  settingsSectionResponseSchema,
  type SettingsSectionKey,
} from '@inspower/shared';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { cn } from '@inspower/ui/lib/utils';
import { SettingsForm } from '@/features/settings/settings-form';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.settings.title };
export const dynamic = 'force-dynamic';

const sectionsSchema = z.object({
  sections: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      description: z.string(),
      permission: z.string(),
      stepUp: z.boolean(),
      canEdit: z.boolean(),
    }),
  ),
});

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('settings.read')) redirect('/dashboard');
  const { section: requested } = await searchParams;
  const section: SettingsSectionKey = (settingsSectionKeys as string[]).includes(requested ?? '')
    ? (requested as SettingsSectionKey)
    : 'general';
  const cookie = await cookieHeader();
  const [list, data] = await Promise.all([
    apiServer('/settings', sectionsSchema, { cookie }),
    apiServer(`/settings/${section}`, settingsSectionResponseSchema, { cookie }),
  ]);
  const current = list.sections.find((s) => s.key === section)!;
  return (
    <Page title={appRoutes.settings.title} fullName={session.user.fullName}>
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:flex-col">
          {list.sections.map((s) => (
            <Link
              key={s.key}
              href={{ pathname: '/admin/settings', query: { section: s.key } }}
              aria-current={s.key === section ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-accent',
                s.key === section ? 'bg-accent font-medium' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <Card>
          <CardHeader>
            <CardTitle>{current.label}</CardTitle>
            <CardDescription>
              {current.description}
              {current.stepUp ? ' Saving asks for your password or a code.' : ''}
              {!current.canEdit ? ' You can read this section but not change it.' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm
              key={section + data.updatedAt}
              section={section}
              data={data}
              canEdit={current.canEdit}
            />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
