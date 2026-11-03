import { appearance } from '@/lib/appearance';
import { publicSettings } from '@/lib/brand';

export const dynamic = 'force-dynamic';

/** The PWA manifest: name and colours from Settings, icons from the brand pictures. */
export async function GET() {
  const [s, a] = await Promise.all([publicSettings(), appearance()]);
  const icon = a.assets['favicon'];
  const manifest = {
    name: s.appName,
    short_name: s.appName.slice(0, 12),
    description: s.tagline,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: a.theme.brand,
    icons: icon
      ? [{ src: icon, sizes: 'any', type: 'image/png', purpose: 'any maskable' }]
      : [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      'content-type': 'application/manifest+json',
      'cache-control': 'public, max-age=300',
    },
  });
}
