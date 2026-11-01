import type { Metadata } from 'next';
import { profileSchema, sessionListSchema } from '@inspower/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { HealthCard } from '@/features/health/health-card';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.dashboard.title };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireSession();
  const cookie = await cookieHeader();
  const [profile, sessions] = await Promise.all([
    apiServer('/profile', profileSchema, { cookie }),
    apiServer('/profile/sessions', sessionListSchema, { cookie }),
  ]);
  return (
    <Page title={appRoutes.dashboard.title} fullName={session.user.fullName}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Welcome, {session.user.fullName.split(' ')[0]}</CardTitle>
            <CardDescription>
              {session.user.isSuperAdmin ? 'Super Admin' : 'Member'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {profile.lastSignInAt
              ? `Last sign-in ${new Date(profile.lastSignInAt).toLocaleString('en-GB')}.`
              : 'This is your first sign-in.'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Devices signed in as you</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{sessions.sessions.length}</p>
            <p className="text-sm text-muted-foreground">
              Manage them under My profile → Security.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Two-step verification</CardTitle>
            <CardDescription>{profile.twoFactorEnabled ? 'On' : 'Not set up yet'}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {profile.twoFactorEnabled
              ? 'Your account asks for a code from your authenticator app.'
              : 'Protect your account with a code from your phone. Setting it up arrives with Phase 2.'}
          </CardContent>
        </Card>
        {session.user.isSuperAdmin || session.user.permissions.includes('system.read') ? (
          <div className="md:col-span-2 xl:col-span-3">
            <HealthCard cookie={cookie} />
          </div>
        ) : null}
      </div>
    </Page>
  );
}
