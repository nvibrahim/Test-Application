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

test('backups: Back up now behind step-up, the row completes live, Verify drills it, Restore needs the word', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser is enough for the worker journey');
  await signIn(page);
  await page.goto('/admin/backups');
  await expect(page.getByRole('heading', { name: 'Backups', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Last backup')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Back up now' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Confirm it is you' });
  await dialog.getByLabel('Password').fill(OWNER.password);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Backup queued')).toBeVisible();
  // the worker takes the backup and the outbox refreshes the screen
  await expect(page.getByText('completed').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/KiB|MiB/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Verify' }).first().click();
  await expect(page.getByText('Verification queued')).toBeVisible();
  await expect(page.getByText(/Drill passed/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Passed: the backup restored')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Restore…' }).first().click();
  const restore = page.getByRole('dialog');
  await expect(restore.getByRole('heading', { name: /Restore the backup from/ })).toBeVisible();
  const go = restore.getByRole('button', { name: 'Restore now' });
  await expect(go).toBeDisabled();
  await restore.getByLabel('Type RESTORE to continue').fill('restore');
  await expect(go).toBeDisabled();
  await restore.getByRole('button', { name: 'Cancel' }).click();
  await expect(restore).toBeHidden();

  // the dashboard health card now shows the backup and disk checks
  await page.goto('/dashboard');
  await expect(page.getByText('Last backup').first()).toBeVisible();
  await expect(page.getByText('Disk space for backups')).toBeVisible();
});
