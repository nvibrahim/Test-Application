import Link from 'next/link';
import { appearance } from '@/lib/appearance';
import { publicSettings } from '@/lib/brand';
import { BrandMark } from '@/shell/brand-mark';

/** Sign-in and friends: a single card, a brand panel (colour or uploaded picture) on wide screens. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [s, look] = await Promise.all([publicSettings(), appearance()]);
  const image = look.settings.signInPanel === 'image' ? look.assets['sign_in_image'] : undefined;
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside
        className="relative hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={
          image
            ? {
                backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url(${image})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        <Link href="/" className="text-lg font-semibold">
          <BrandMark assets={look.assets} name={s.appName} onDark />
        </Link>
        <p className="max-w-sm text-sm opacity-90">
          {s.tagline || 'One place for your organization’s people, settings and records.'}
        </p>
      </aside>
      <main className="flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="text-lg font-semibold">
              <BrandMark assets={look.assets} name={s.appName} />
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
