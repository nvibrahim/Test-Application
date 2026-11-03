import { expect, test, type Page } from '@playwright/test';
import { generateSync } from 'otplib';
import { expectAccessible } from './a11y';

/**
 * Runs after auth.spec.ts (files run in order, one worker): the owner has set up the
 * organization and uses the current owner password. Each project runs the whole journey against a fresh state,
 * because the last step turns two-step verification off again.
 */
import { OWNER_EMAIL, ownerPassword } from './owner';

const OWNER = {
  email: OWNER_EMAIL,
  get password() {
    return ownerPassword();
  },
};

test.describe.configure({ mode: 'serial' });

const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)').first();

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** A code for the next unused step: the confirm step consumes the current one. */
function codeFor(secret: string, stepsAhead = 0) {
  return generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + stepsAhead * 30 });
}

test('the owner turns on two-step verification, signs in with a code, trusts the device, and turns it off with step-up', async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Protect your account: set up two-step verification.')).toBeVisible();

  await page.getByRole('link', { name: 'Set up now' }).first().click();
  await expect(page).toHaveURL(/\/profile\?tab=security$/);
  await page.getByRole('button', { name: 'Set up two-step verification' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Set up two-step verification' })).toBeVisible();
  await expect(dialog.getByRole('img', { name: /QR code/ })).toBeVisible();
  const secret = (await dialog.getByTestId('totp-secret').textContent())!.trim();
  await expectAccessible(page);

  await dialog.getByLabel('6-digit code from the app').fill('000000');
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(dialog.locator('[role="alert"]')).toContainText('not right');
  await dialog.getByLabel('6-digit code from the app').fill(codeFor(secret));
  await dialog.getByRole('button', { name: 'Turn on' }).click();

  const codes = page
    .getByRole('dialog')
    .getByRole('list', { name: 'Recovery codes' })
    .getByRole('listitem');
  await expect(codes).toHaveCount(10);
  const recovery = (await codes.first().textContent())!.trim();
  await page.getByRole('dialog').getByLabel('I have saved these codes').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Two-step verification is on.')).toBeVisible();
  await expect(page.getByText('Protect your account: set up two-step verification.')).toHaveCount(
    0,
  );

  // Sign out and back in: the code is asked for; trust the device.
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await signIn(page);
  await expect(page).toHaveURL(/\/two-factor$/);
  await expectAccessible(page);
  await page.getByLabel('6-digit code').fill(codeFor(secret, 1));
  await page.getByLabel(/Trust this device/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // The trusted device skips the code next time.
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);

  // A recovery code works once, from a browser that is not trusted.
  const fresh = await page
    .context()
    .browser()!
    .newContext({ ...test.info().project.use });
  const other = await fresh.newPage();
  await other.goto('/sign-in');
  await other.getByLabel('Email').fill(OWNER.email);
  await other.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await other.getByRole('button', { name: 'Sign in' }).click();
  await expect(other).toHaveURL(/\/two-factor$/);
  await other.getByRole('button', { name: /Use a recovery code/ }).click();
  await other.getByLabel('Recovery code').fill(recovery);
  await other.getByRole('button', { name: 'Continue' }).click();
  await expect(other).toHaveURL(/\/dashboard$/);
  await fresh.close();

  // Turning it off asks for step-up.
  await page.goto('/profile?tab=security');
  await expect(page.getByText(/9 recovery codes left/)).toBeVisible();
  await expect(page.getByText('Trusted devices')).toBeVisible();
  await page.getByRole('button', { name: 'Turn off' }).click();
  const stepUp = page.getByRole('dialog');
  await expect(stepUp.getByRole('heading', { name: 'Confirm it is you' })).toBeVisible();
  await expectAccessible(page);
  await stepUp.getByLabel('Password').fill('wrong-password-here');
  await stepUp.getByRole('button', { name: 'Continue' }).click();
  await expect(stepUp.locator('[role="alert"]')).toContainText('wrong');
  await stepUp.getByLabel('Password').fill(OWNER.password);
  await stepUp.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Two-step verification is off.')).toBeVisible();
  await expect(alert(page)).toContainText('off');
});

test('the Users list shows the two-step column and the filter', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one width is enough for the list');
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Off' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Two-step on' }).click();
  await expect(page.getByText(/^0 people/)).toBeVisible();
  await expectAccessible(page);
});
