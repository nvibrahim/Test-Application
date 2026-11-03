import { describe, expect, it } from 'vitest';
import { notificationTypes } from '../notifications.js';
import { settingsSectionKeys, settingsSectionRules, settingsSections } from './sections.js';

describe('settings sections', () => {
  it('every section parses from nothing (defaults) and has a rule', () => {
    for (const key of settingsSectionKeys) {
      expect(() => settingsSections[key].parse({})).not.toThrow();
      expect(settingsSectionRules[key].permission).toMatch(/^settings\./);
    }
  });
  it('security, email, backups and maintenance ask for step-up', () => {
    expect(settingsSectionKeys.filter((k) => settingsSectionRules[k].stepUp).sort()).toEqual([
      'backups',
      'email',
      'maintenance',
      'security',
    ]);
  });
  it('refuses a bad colour and a bad nightly time', () => {
    expect(settingsSections.appearance.safeParse({ brandColor: 'blue' }).success).toBe(false);
    expect(settingsSections.backups.safeParse({ nightlyAt: '25:00' }).success).toBe(false);
  });
  it('notification types have unique keys', () => {
    const keys = notificationTypes.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
