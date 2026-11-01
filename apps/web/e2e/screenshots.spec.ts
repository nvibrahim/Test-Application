import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, type Page } from '@playwright/test';

/**
 * Pictures of the main screens at this width, for the docs. Runs after auth.spec.ts (files run
 * in order), when the owner has set up the organization. Output: SCREENSHOT_DIR or test-results/screens.
 */
const OWNER = { email: 'owner@example.test', password: 'orbit-meadow-copper-sixteen-91' };
const dir = process.env['SCREENSHOT_DIR'] ?? path.resolve(__dirname, '../test-results/screens');

async function shot(page: Page, name: string, project: string) {
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}-${project}.png`), fullPage: true });
}

test('screens', async ({ page }, testInfo) => {
  test.skip(process.env['SCREENSHOTS'] !== '1', 'set SCREENSHOTS=1 to capture');
  const p = testInfo.project.name;
  await page.goto('/sign-in');
  await shot(page, 'sign-in', p);
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.waitForLoadState('networkidle');
  await shot(page, 'dashboard', p);
  await page.goto('/profile?tab=security');
  await page.waitForLoadState('networkidle');
  await shot(page, 'profile-security', p);
});
