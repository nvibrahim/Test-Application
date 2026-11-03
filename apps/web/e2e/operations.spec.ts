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

async function stepUp(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Confirm it is you' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Password').fill(OWNER.password);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog).toBeHidden();
}

test('operations: jobs history fills from the worker, a scheduled job pauses and runs now, the audit log filters and exports, a feature switch changes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'tablet', 'phone and desktop are enough for these screens');
  test.setTimeout(180_000);
  await signIn(page);

  await page.goto('/admin/jobs');
  await expect(page.getByRole('heading', { name: 'Jobs', exact: true }).first()).toBeVisible();
  await expect(page.getByText('History')).toBeVisible();
  // earlier journeys sent emails and took backups through the worker, so history is not empty
  await expect(page.getByText(/email \/|backup \//).first()).toBeVisible();
  await expectAccessible(page);

  await page.goto('/admin/jobs?tab=scheduled');
  const row = page.locator('li').filter({ hasText: 'Outbox cleanup' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Outbox cleanup paused.')).toBeVisible();
  await expect(row.getByText('Paused')).toBeVisible();
  await row.getByRole('button', { name: 'Run now' }).click();
  await expect(page.getByText('Outbox cleanup queued to run now.')).toBeVisible();
  await expect(row.getByText(/Removed \d+ published/)).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('Outbox cleanup resumed.')).toBeVisible();
  await expectAccessible(page);

  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Audit log', exact: true }).first()).toBeVisible();
  await page.getByLabel('Action').fill('jobs.');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(
    page.getByText('jobs.schedule.paused').filter({ visible: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('scheduled_job');
  await page.keyboard.press('Escape');
  await expectAccessible(page);

  if (testInfo.project.name === 'desktop') {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    await stepUp(page);
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^audit-log-.*\.csv$/);
    const text = await (
      await file.createReadStream()
    )
      .toArray()
      .then((c) => Buffer.concat(c).toString('utf8'));
    expect(text).toContain('jobs.schedule.paused');
  }

  await page.goto('/admin/features');
  await expect(
    page.getByRole('heading', { name: 'Feature switches', exact: true }).first(),
  ).toBeVisible();
  // off by default: the gallery is hidden even from the Super Admin
  await page.goto('/design-system');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/admin/features');
  await page
    .getByRole('group', { name: 'State of Design system page' })
    .getByLabel('Super Admin only')
    .check();
  await page.getByRole('button', { name: 'Save' }).first().click();
  if (testInfo.project.name !== 'desktop') await stepUp(page);
  await expect(page.getByText('Saved').first()).toBeVisible();
  await expectAccessible(page);
  await page.goto('/design-system');
  await expect(
    page.getByRole('heading', { name: 'Design system', exact: true }).first(),
  ).toBeVisible();
  // and back off, so the next browser width starts from the default
  await page.goto('/admin/features');
  await page
    .getByRole('group', { name: 'State of Design system page' })
    .getByLabel('Off for everyone')
    .check();
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Saved').first()).toBeVisible();
});
