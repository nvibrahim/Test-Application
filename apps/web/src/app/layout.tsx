import type { Metadata, Viewport } from 'next';
import { appName } from '@/lib/brand';
import { getSession } from '@/lib/session';
import { apiServer } from '@/lib/api';
import { cookieHeader } from '@/lib/session';
import { profileSchema } from '@inspower/shared';
import './globals.css';

export const metadata: Metadata = {
  title: { default: appName(), template: `%s · ${appName()}` },
  description: 'Foundation platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#171a21' },
  ],
};

/** Applies the device theme before first paint when the preference is "system". */
const themeScript = `(function(){try{var t=document.documentElement.dataset.theme;if(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}})();`;

async function themePreference(): Promise<'light' | 'dark' | 'system'> {
  const session = await getSession().catch(() => null);
  if (!session || session.stage !== 'active') return 'system';
  const profile = await apiServer('/profile', profileSchema, {
    cookie: await cookieHeader(),
  }).catch(() => null);
  return profile?.preferences.theme ?? 'system';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await themePreference();
  return (
    <html
      lang="en"
      data-theme={theme}
      className={theme === 'dark' ? 'dark' : undefined}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
