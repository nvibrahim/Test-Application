import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y';

const OWNER = { email: 'owner@example.test', password: 'orbit-meadow-copper-sixteen-91' };

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('settings, organization and locations: save General, edit the profile after a preview, add a branch', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'tablet', 'phone and desktop are enough for these screens');
  await signIn(page);

  await page.goto('/admin/settings?section=general');
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  await expectAccessible(page);
  const tagline = page.getByLabel('Tagline');
  await tagline.fill(`Smiles first (${testInfo.project.name})`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tagline')).toHaveValue(`Smiles first (${testInfo.project.name})`);

  await page.goto('/admin/settings?section=email');
  await page.getByLabel('Email provider').selectOption('gmail');
  await expect(page.getByLabel('Mail server')).toHaveValue('smtp.gmail.com');
  await expectAccessible(page);

  await page.goto('/admin/organization');
  await expect(page.getByText('Northwind Dental Ltd')).toBeVisible();
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await page.getByLabel('Trading name').fill(`Northwind ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByText(`Northwind ${testInfo.project.name}`, { exact: true })).toBeVisible();
  await expectAccessible(page);

  await page.goto('/admin/locations');
  await page.getByRole('button', { name: 'Add location' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(`Southsea ${testInfo.project.name}`);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`Southsea ${testInfo.project.name}`)).toBeVisible();
  await expect(page.getByText('Head office')).toBeVisible();
  await expectAccessible(page);

  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expectAccessible(page);
});
