import type { Metadata, Viewport } from 'next';
import { appName } from '@/lib/brand';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
