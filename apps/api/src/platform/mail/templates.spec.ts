import { describe, expect, it } from 'vitest';
import { renderEmail } from './templates';

describe('renderEmail', () => {
  it('escapes HTML in names and keeps the link in both parts', () => {
    const r = renderEmail({
      name: 'password-reset',
      params: {
        appName: 'Inspower',
        fullName: '<b>Priya</b>',
        link: 'https://x.test/reset?token=abc',
        minutes: 30,
      },
    });
    expect(r.html).toContain('&lt;b&gt;Priya&lt;/b&gt;');
    expect(r.html).not.toContain('<b>Priya</b>');
    expect(r.text).toContain('https://x.test/reset?token=abc');
    expect(r.subject).toBe('Reset your Inspower password');
  });
});
