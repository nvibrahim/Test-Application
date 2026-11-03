import type { AppearanceSettings } from '../settings/sections.js';
import { contrastRatio, mix, parseHex, rgbToHsl, withLightness } from './color.js';

/**
 * The theme engine. Input: one brand colour and the Appearance choices. Output: every token the
 * design system reads, for light and dark, with every text/background pair at WCAG 2.2 AA
 * (4.5:1 for text, 3:1 for outlines and focus rings). Status and chart colours never change.
 *
 * A brand colour too light for white text is darkened until white reads on it; the hue stays.
 */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

const WHITE = '#ffffff';
const INK = '#111827';
const DARK_BG = '#171a21';
const DARK_CARD = '#1f232c';
const DARK_TEXT = '#f1f3f7';

export const colorPresets = [
  { key: 'blue', label: 'Blue', hex: '#1d4ed8' },
  { key: 'teal', label: 'Teal', hex: '#0f766e' },
  { key: 'green', label: 'Green', hex: '#15803d' },
  { key: 'purple', label: 'Purple', hex: '#6d28d9' },
  { key: 'slate', label: 'Slate', hex: '#334155' },
  { key: 'maroon', label: 'Maroon', hex: '#99244f' },
] as const;

export interface ThemeTokens {
  [token: string]: string;
}

export interface BuiltTheme {
  /** The brand colour actually used (darkened when needed) */
  brand: string;
  adjusted: boolean;
  light: ThemeTokens;
  dark: ThemeTokens;
  /** `data-*` attributes for <html>, read by globals.css */
  attributes: Record<string, string>;
}

/** Darkens until the given foreground reads at AA on it. */
export function readableOn(
  background: string,
  foreground: string,
  target = AA_TEXT,
): { color: string; adjusted: boolean } {
  if (contrastRatio(background, foreground) >= target)
    return { color: background, adjusted: false };
  const { l } = rgbToHsl(parseHex(background));
  for (let step = l - 0.02; step >= 0.05; step -= 0.02) {
    const candidate = withLightness(background, step);
    if (contrastRatio(candidate, foreground) >= target) return { color: candidate, adjusted: true };
  }
  return { color: withLightness(background, 0.2), adjusted: true };
}

/** Lightens (dark mode) until the colour reads as text on a dark background. */
function readableAsTextOn(background: string, color: string, target = AA_TEXT): string {
  if (contrastRatio(color, background) >= target) return color;
  const { l } = rgbToHsl(parseHex(color));
  for (let step = l + 0.02; step <= 0.95; step += 0.02) {
    const candidate = withLightness(color, step);
    if (contrastRatio(candidate, background) >= target) return candidate;
  }
  return withLightness(color, 0.85);
}

export function buildTheme(
  appearance: Pick<
    AppearanceSettings,
    'brandColor' | 'sidebarStyle' | 'topBarStyle' | 'cornerRadius'
  >,
): BuiltTheme {
  const base = appearance.brandColor ?? colorPresets[0].hex;
  const { color: brand, adjusted } = readableOn(base, WHITE);

  // Light mode
  const primary = brand;
  const primaryHover = withLightness(primary, Math.max(0.1, rgbToHsl(parseHex(primary)).l - 0.06));
  const accent = mix(primary, WHITE, 0.9); // a tint for selected rows and hovers
  const accentForeground = readableOn(accent, INK, AA_TEXT).color === accent ? INK : INK;
  const ring = primary;
  const sidebarBg =
    appearance.sidebarStyle === 'dark'
      ? '#0f172a'
      : appearance.sidebarStyle === 'brand'
        ? primary
        : '#ffffff';
  const sidebarFg = appearance.sidebarStyle === 'light' ? INK : WHITE;
  const sidebarActive =
    appearance.sidebarStyle === 'light'
      ? accent
      : readableOn(mix(sidebarBg, WHITE, 0.16), WHITE).color;
  const topBarBg = appearance.topBarStyle === 'brand' ? primary : '#ffffff';
  const topBarFg = appearance.topBarStyle === 'brand' ? WHITE : INK;

  // Dark mode: the brand as text/buttons on dark backgrounds must read; buttons keep dark text when the colour is light.
  const darkPrimary = readableAsTextOn(
    DARK_BG,
    withLightness(primary, Math.max(rgbToHsl(parseHex(primary)).l, 0.62)),
  );
  const darkPrimaryFg = contrastRatio(darkPrimary, INK) >= AA_TEXT ? INK : WHITE;
  const darkAccent = mix(DARK_CARD, darkPrimary, 0.22);
  const darkSidebarBg =
    appearance.sidebarStyle === 'brand' ? mix(DARK_BG, primary, 0.35) : DARK_CARD;
  const darkTopBarBg = appearance.topBarStyle === 'brand' ? mix(DARK_BG, primary, 0.35) : DARK_BG;

  const light: ThemeTokens = {
    primary,
    'primary-hover': primaryHover,
    'primary-foreground': WHITE,
    accent,
    'accent-foreground': accentForeground,
    ring,
    'sidebar-background': sidebarBg,
    'sidebar-foreground': sidebarFg,
    'sidebar-active': sidebarActive,
    'sidebar-active-foreground': appearance.sidebarStyle === 'light' ? INK : WHITE,
    'topbar-background': topBarBg,
    'topbar-foreground': topBarFg,
    link: readableOn(primary, WHITE).color,
  };
  const dark: ThemeTokens = {
    primary: darkPrimary,
    'primary-hover': withLightness(
      darkPrimary,
      Math.min(0.9, rgbToHsl(parseHex(darkPrimary)).l + 0.06),
    ),
    'primary-foreground': darkPrimaryFg,
    accent: darkAccent,
    'accent-foreground': DARK_TEXT,
    ring: darkPrimary,
    'sidebar-background': darkSidebarBg,
    'sidebar-foreground': DARK_TEXT,
    'sidebar-active': readableOn(mix(darkSidebarBg, WHITE, 0.14), DARK_TEXT).color,
    'sidebar-active-foreground': DARK_TEXT,
    'topbar-background': darkTopBarBg,
    'topbar-foreground': DARK_TEXT,
    link: darkPrimary,
  };
  const radius = { small: '0.25rem', medium: '0.5rem', large: '0.875rem' }[appearance.cornerRadius];
  return {
    brand,
    adjusted,
    light,
    dark,
    attributes: {
      'data-sidebar': appearance.sidebarStyle,
      'data-topbar': appearance.topBarStyle,
      'data-radius': appearance.cornerRadius,
      'data-radius-value': radius,
    },
  };
}

/** The <style> block the root layout injects. Nothing is emitted for the built-in look. */
export function themeCss(theme: BuiltTheme): string {
  const vars = (tokens: ThemeTokens) =>
    Object.entries(tokens)
      .map(([k, v]) => `--${k}: ${v};`)
      .join(' ');
  return `:root { ${vars(theme.light)} --radius: ${theme.attributes['data-radius-value']}; } .dark { ${vars(theme.dark)} }`;
}

/** Every text/background pair the engine is responsible for, with the ratio it must meet. */
export function themePairs(
  theme: BuiltTheme,
): { mode: 'light' | 'dark'; fg: string; bg: string; min: number; name: string }[] {
  const pairs: { mode: 'light' | 'dark'; fg: string; bg: string; min: number; name: string }[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const t = theme[mode];
    const page = mode === 'light' ? WHITE : DARK_BG;
    pairs.push({
      mode,
      name: 'button text on primary',
      fg: t['primary-foreground']!,
      bg: t['primary']!,
      min: AA_TEXT,
    });
    pairs.push({
      mode,
      name: 'button text on primary hover',
      fg: t['primary-foreground']!,
      bg: t['primary-hover']!,
      min: AA_TEXT,
    });
    pairs.push({
      mode,
      name: 'text on accent',
      fg: t['accent-foreground']!,
      bg: t['accent']!,
      min: AA_TEXT,
    });
    pairs.push({
      mode,
      name: 'sidebar text',
      fg: t['sidebar-foreground']!,
      bg: t['sidebar-background']!,
      min: AA_TEXT,
    });
    pairs.push({
      mode,
      name: 'sidebar active text',
      fg: t['sidebar-active-foreground']!,
      bg: t['sidebar-active']!,
      min: AA_TEXT,
    });
    pairs.push({
      mode,
      name: 'top bar text',
      fg: t['topbar-foreground']!,
      bg: t['topbar-background']!,
      min: AA_TEXT,
    });
    pairs.push({ mode, name: 'link on page', fg: t['link']!, bg: page, min: AA_TEXT });
    pairs.push({ mode, name: 'focus ring on page', fg: t['ring']!, bg: page, min: AA_LARGE });
  }
  return pairs;
}
