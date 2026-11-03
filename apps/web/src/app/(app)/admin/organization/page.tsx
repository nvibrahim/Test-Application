import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { organizationProfileSchema } from '@inspower/shared';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { OrganizationEditor } from '@/features/organization/organization-editor';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.organization.title };
export const dynamic = 'force-dynamic';

const referenceSchema = z.object({
  countries: z.array(z.object({ code: z.string(), name: z.string() })),
  currencies: z.array(z.object({ code: z.string(), name: z.string() })),
  timeZones: z.array(z.string()),
});

export default async function OrganizationPage() {
  const session = await requireSession();
  const may = (p: string) => session.user.isSuperAdmin || session.user.permissions.includes(p);
  if (!may('organization.read')) redirect('/dashboard');
  const cookie = await cookieHeader();
  const [profile, reference] = await Promise.all([
    apiServer('/organization', organizationProfileSchema, { cookie }),
    apiServer('/setup/reference', referenceSchema, { cookie }),
  ]);
  return (
    <Page title={appRoutes.organization.title} fullName={session.user.fullName}>
      <Card>
        <CardHeader>
          <CardTitle>Organization profile</CardTitle>
          <CardDescription>
            Legal details, country, currency and formats. One organization per deployment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationEditor
            profile={profile}
            reference={reference}
            canEdit={may('organization.manage')}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
