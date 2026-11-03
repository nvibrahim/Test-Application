import 'server-only';
import { DEFAULT_APP_NAME, publicSettingsSchema, type PublicSettings } from '@inspower/shared';
import { apiServer } from './api';

/** The product name and public look come from Settings -> General and Appearance, read once per request. */
export async function publicSettings(): Promise<PublicSettings> {
  try {
    return await apiServer('/settings/public', publicSettingsSchema);
  } catch {
    return {
      appName: process.env['APP_NAME'] ?? DEFAULT_APP_NAME,
      tagline: '',
      supportEmail: null,
      landing: { headline: '', intro: '', showContactForm: false },
      appearance: {
        version: 1,
        brandColor: null,
        sidebarStyle: 'light',
        topBarStyle: 'plain',
        signInPanel: 'brand',
        defaultTheme: 'system',
        defaultDensity: 'comfortable',
        cornerRadius: 'medium',
      },
      maintenance: { enabled: false, message: '' },
      organizationName: null,
      version: 'dev',
    };
  }
}

export async function appName(): Promise<string> {
  return (await publicSettings()).appName;
}
