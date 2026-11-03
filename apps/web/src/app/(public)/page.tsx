import Link from 'next/link';
import { Button } from '@inspower/ui/components/button';
import { publicSettings } from '@/lib/brand';
import { getSession, homeFor } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** The landing page. Wording comes from Settings -> General, so each deployment shows its own. */
export default async function HomePage() {
  const [s, session] = await Promise.all([publicSettings(), getSession()]);
  const target = session ? homeFor(session.stage, session.setupComplete) : '/sign-in';
  return (
    <main>
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center sm:py-24">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          {s.organizationName ?? s.appName}
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
          {s.landing.headline || s.tagline}
        </h1>
        <p className="max-w-prose text-pretty text-muted-foreground sm:text-lg">
          {s.landing.intro}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href={target as never}>{session ? 'Open the app' : 'Sign in'}</Link>
          </Button>
          {s.landing.showContactForm && s.supportEmail ? (
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Contact us</Link>
            </Button>
          ) : null}
        </div>
      </section>
      <section className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-3">
          {[
            {
              title: 'Protected sign-in',
              text: 'Strong passwords, two-step verification, and a record of every sign-in.',
            },
            {
              title: 'People and roles',
              text: 'Invite your team, give each person exactly what they need, limit by location.',
            },
            {
              title: 'Backed up every night',
              text: 'Encrypted backups, kept locally and off-site, tested by a weekly restore drill.',
            },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
