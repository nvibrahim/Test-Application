import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { profileSchema } from '@inspower/shared';
import { apiServer } from '@/lib/api';
import { appearance } from '@/lib/appearance';
import { publicSettings } from '@/lib/brand';
import { cookieHeader, getSession } from '@/lib/session';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const [s, a] = await Promise.all([publicSettings(), appearance()]);
  return {
    title: { default: s.appName, template: `%s · ${s.appName}` },
    description: s.tagline || 'Foundation platform',
    manifest: '/manifest.webmanifest',
    icons: a.assets['favicon'] ? [{ rel: 'icon', url: a.assets['favicon'] }] : undefined,
    appleWebApp: { capable: true, title: s.appName, statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#171a21' },
  ],
};

/** Applies the device theme before first paint when the preference is "system". */
const themeScript = `(function(){try{var t=document.documentElement.dataset.theme;if(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}})();`;

async function themePreference(
  defaultTheme: 'light' | 'dark' | 'system',
): Promise<'light' | 'dark' | 'system'> {
  const session = await getSession().catch(() => null);
  if (!session || session.stage !== 'active') return defaultTheme;
  const profile = await apiServer('/profile', profileSchema, {
    cookie: await cookieHeader(),
  }).catch(() => null);
  return profile?.preferences.theme ?? defaultTheme;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [look, nonce] = await Promise.all([
    appearance(),
    headers().then((h) => h.get('x-nonce') ?? undefined),
  ]);
  const theme = await themePreference(look.settings.defaultTheme);
  const attrs = Object.fromEntries(
    Object.entries(look.theme.attributes).filter(([k]) => k !== 'data-radius-value'),
  );
  return (
    <html
      lang="en"
      data-theme={theme}
      data-density={look.settings.defaultDensity}
      {...attrs}
      className={theme === 'dark' ? 'dark' : undefined}
      suppressHydrationWarning
    >
      <head>
        {look.css ? (
          <style id="brand-theme" nonce={nonce} dangerouslySetInnerHTML={{ __html: look.css }} />
        ) : null}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
