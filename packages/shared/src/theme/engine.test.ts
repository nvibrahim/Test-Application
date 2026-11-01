import { describe, expect, it } from 'vitest';
import { contrastRatio } from './color.js';
import { buildTheme, colorPresets, readableOn, themeCss, themePairs } from './engine.js';

const sidebarStyles = ['light', 'dark', 'brand'] as const;
const topBarStyles = ['plain', 'brand'] as const;
const customColours = [
  '#ff0000',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#ff00ff',
  '#f8fafc',
  '#000000',
  '#fbbf24',
  '#a3e635',
  '#38bdf8',
  '#e11d48',
  '#4b5563',
  '#7c3aed',
  '#0ea5e9',
  '#84cc16',
  '#f97316',
];

describe('the theme engine', () => {
  it('meets WCAG AA for every pair, every preset, every sidebar and top bar style, in both modes', () => {
    for (const preset of colorPresets) {
      for (const sidebarStyle of sidebarStyles) {
        for (const topBarStyle of topBarStyles) {
          const theme = buildTheme({
            brandColor: preset.hex,
            sidebarStyle,
            topBarStyle,
            cornerRadius: 'medium',
          });
          for (const p of themePairs(theme)) {
            expect(
              contrastRatio(p.fg, p.bg),
              `${preset.key} ${sidebarStyle} ${topBarStyle} ${p.mode} ${p.name}`,
            ).toBeGreaterThanOrEqual(p.min);
          }
        }
      }
    }
  });
  it('holds for a spread of custom colours, darkening the ones white cannot be read on', () => {
    for (const hex of customColours) {
      const theme = buildTheme({
        brandColor: hex,
        sidebarStyle: 'brand',
        topBarStyle: 'brand',
        cornerRadius: 'large',
      });
      for (const p of themePairs(theme))
        expect(contrastRatio(p.fg, p.bg), `${hex} ${p.mode} ${p.name}`).toBeGreaterThanOrEqual(
          p.min,
        );
    }
    expect(readableOn('#ffff00', '#ffffff').adjusted).toBe(true);
    expect(readableOn('#1d4ed8', '#ffffff').adjusted).toBe(false);
  });
  it('emits a style block with light and dark variables and the radius', () => {
    const css = themeCss(
      buildTheme({
        brandColor: '#0f766e',
        sidebarStyle: 'dark',
        topBarStyle: 'plain',
        cornerRadius: 'small',
      }),
    );
    expect(css).toContain(':root {');
    expect(css).toContain('.dark {');
    expect(css).toContain('--radius: 0.25rem');
    expect(css).toContain('--primary: #0f766e');
  });
  it('uses the built-in blue when no colour is chosen', () => {
    expect(
      buildTheme({
        brandColor: null,
        sidebarStyle: 'light',
        topBarStyle: 'plain',
        cornerRadius: 'medium',
      }).brand,
    ).toBe('#1d4ed8');
  });
});
