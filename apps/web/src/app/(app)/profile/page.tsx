import type { Metadata } from 'next';
import Link from 'next/link';
import { profileSchema, sessionListSchema, twoFactorStatusSchema } from '@inspower/shared';
import { TwoFactorCard } from '@/features/two-factor/two-factor-card';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { cn } from '@inspower/ui/lib/utils';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { EmailChangeForm } from '@/features/profile/email-change-form';
import { PersonalForm } from '@/features/profile/personal-form';
import { PreferencesForm } from '@/features/profile/preferences-form';
import { SessionsList } from '@/features/profile/sessions-list';
import { apiServer } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { cookieHeader, requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: appRoutes.profile.title };
export const dynamic = 'force-dynamic';

const tabs = [
  { key: 'personal', label: 'Personal info' },
  { key: 'security', label: 'Security' },
  { key: 'preferences', label: 'Preferences' },
] as const;
type Tab = (typeof tabs)[number]['key'];

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession();
  const { tab: requested } = await searchParams;
  const tab: Tab = tabs.some((t) => t.key === requested) ? (requested as Tab) : 'personal';
  const cookie = await cookieHeader();
  const [profile, sessions, twoFactor] = await Promise.all([
    apiServer('/profile', profileSchema, { cookie }),
    apiServer('/profile/sessions', sessionListSchema, { cookie }),
    apiServer('/two-factor', twoFactorStatusSchema, { cookie }),
  ]);

  return (
    <Page title={appRoutes.profile.title} fullName={session.user.fullName}>
      <nav aria-label="Profile sections" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={{ pathname: '/profile', query: { tab: t.key } }}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'personal' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Personal info</CardTitle>
              <CardDescription>How your name appears to others.</CardDescription>
            </CardHeader>
            <CardContent>
              <PersonalForm fullName={profile.fullName} email={profile.email} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Change email</CardTitle>
              <CardDescription>
                Confirmed from the new address before it takes effect.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailChangeForm currentEmail={profile.email} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'security' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>
                {profile.passwordChangedAt
                  ? `Last changed ${new Date(profile.passwordChangedAt).toLocaleDateString('en-GB')}.`
                  : 'Never changed.'}{' '}
                Changing it signs out every other session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm email={profile.email} fullName={profile.fullName} />
            </CardContent>
          </Card>
          <TwoFactorCard status={twoFactor} />
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Where you are signed in</CardTitle>
              <CardDescription>Sign out any device you do not recognise.</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionsList sessions={sessions.sessions} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'preferences' ? (
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Your own look and feel. Site-wide appearance arrives with Phase 5.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesForm preferences={profile.preferences} />
          </CardContent>
        </Card>
      ) : null}
    </Page>
  );
}
