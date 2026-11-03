import Link from 'next/link';
import { publicSettings } from '@/lib/brand';
import { appearance } from '@/lib/appearance';
import { BrandMark } from '@/shell/brand-mark';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [s, look] = await Promise.all([publicSettings(), appearance()]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BrandMark assets={look.assets} name={s.appName} />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {s.landing.showContactForm && s.supportEmail ? (
              <Link href="/contact" className="text-muted-foreground hover:text-foreground">
                Contact
              </Link>
            ) : null}
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link href="/sign-in" className="text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        {s.organizationName ? `${s.organizationName} · ` : ''}
        {s.appName}
        {s.supportEmail ? (
          <>
            {' · '}
            <a href={`mailto:${s.supportEmail}`} className="hover:text-foreground">
              {s.supportEmail}
            </a>
          </>
        ) : null}
      </footer>
    </div>
  );
}
