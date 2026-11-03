import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y';

import { OWNER_EMAIL, ownerPassword } from './owner';

const OWNER = {
  email: OWNER_EMAIL,
  get password() {
    return ownerPassword();
  },
};

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('the public pages are accessible and branded from Settings; a brand colour recolours the app with AA kept', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessible(page);
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
  await expectAccessible(page);
  const csp = (await page.request.get('/sign-in')).headers()['content-security-policy'] ?? '';
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src 'self' 'nonce-/);
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe('standalone');

  if (testInfo.project.name !== 'desktop') return;
  await signIn(page);
  await page.goto('/admin/settings?section=appearance');
  await page.getByLabel('Main colour').fill('#0f766e');
  await page.getByLabel('Sidebar').selectOption('brand');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.goto('/dashboard');
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
  );
  expect(primary.toLowerCase()).toBe('#0f766e');
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'brand');
  await expectAccessible(page);
  // back to the built-in look
  await page.goto('/admin/settings?section=appearance');
  await page.getByLabel('Main colour').fill('');
  await page.getByLabel('Sidebar').selectOption('light');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
});
