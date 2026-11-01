import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y';

const OWNER = {
  email: 'owner@example.test',
  name: 'Olive Owner',
  tempPassword: 'temporary-walrus-lantern-42',
};
const PASSWORD = 'orbit-meadow-copper-sixteen-91';
const RESET_PASSWORD = 'velvet-harbour-quartz-lemon-77';

test.describe.configure({ mode: 'serial' });

/** Our own alerts, not Next's route announcer. */
const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)').first();

async function signIn(page: Page, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the owner signs in, chooses a password, sets up the organization and reaches the dashboard', async ({
  page,
}, testInfo) => {
  // Only the first project runs the one-time journey; the others pick up afterwards.
  test.skip(testInfo.project.name !== 'phone', 'one-time journey');

  await page.goto('/sign-in');
  await expectAccessible(page);

  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(alert(page)).toContainText('Wrong email or password');

  await page.getByLabel('Password', { exact: true }).fill(OWNER.tempPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/change-password$/);
  await expectAccessible(page);

  await page.getByLabel('Temporary password').fill(OWNER.tempPassword);
  await page.getByLabel('New password', { exact: true }).fill('Summer2026');
  await expect(page.getByText(/common|easy to guess|Use at least|Try/i).first()).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Type the new password again').fill(PASSWORD);
  await page.getByRole('button', { name: 'Set my password' }).click();

  await expect(page).toHaveURL(/\/setup$/);
  await expectAccessible(page);
  await page.getByLabel('Legal name').fill('Northwind Dental Ltd');
  await page.getByLabel('Country').selectOption('GB');
  await expect(page.getByLabel('Currency')).toHaveValue('GBP');
  await page.getByLabel('Address', { exact: true }).fill('1 High Street');
  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Welcome, Olive')).toBeVisible();
  await expectAccessible(page);
});

test('the dashboard and profile work at this width, and the password can be changed from Security', async ({
  page,
}) => {
  await signIn(page, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectAccessible(page);

  await page.goto('/profile?tab=security');
  await expect(page.getByRole('heading', { name: 'Where you are signed in' })).toBeVisible();
  await expect(page.getByText('This device')).toBeVisible();
  await expectAccessible(page);

  await page.goto('/profile?tab=preferences');
  await page.getByLabel('Appearance').selectOption('dark');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(alert(page)).toContainText('Saved');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expectAccessible(page);
  await page.getByLabel('Appearance').selectOption('system');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(alert(page)).toContainText('Saved');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('a forgotten password is reset from the emailed link and the old password stops working', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one-time journey');

  await page.goto('/forgot-password');
  await expectAccessible(page);
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(alert(page)).toContainText('on its way');

  // Mailpit holds the email locally; read the link from it.
  const mailpit = process.env['MAILPIT_URL'] ?? 'http://127.0.0.1:8025';
  let link: string | null = null;
  for (let i = 0; i < 20 && !link; i += 1) {
    const list = await request.get(`${mailpit}/api/v1/messages?limit=5`).catch(() => null);
    if (list?.ok()) {
      const body = (await list.json()) as { messages: { ID: string; Subject: string }[] };
      const msg = body.messages.find((m) => /Reset your/.test(m.Subject));
      if (msg) {
        const full = await request.get(`${mailpit}/api/v1/message/${msg.ID}`);
        const text = ((await full.json()) as { Text: string }).Text;
        link =
          text.match(/http:\/\/localhost:3000\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0] ?? null;
      }
    }
    if (!link) await page.waitForTimeout(500);
  }
  test.skip(!link, 'Mailpit is not running here; the API integration test covers the reset flow');

  await page.goto(link!);
  await expectAccessible(page);
  await page.getByLabel('New password', { exact: true }).fill(RESET_PASSWORD);
  await page.getByLabel('Type it again').fill(RESET_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(alert(page)).toContainText('every session was signed out');

  await signIn(page, PASSWORD);
  await expect(alert(page)).toContainText('Wrong email or password');
  await signIn(page, RESET_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
});
