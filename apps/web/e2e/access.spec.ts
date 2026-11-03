import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y';

/** Runs after auth and two-factor specs: the owner is set up and two-step is off again. */
import { OWNER_EMAIL, ownerPassword } from './owner';

const OWNER = {
  email: OWNER_EMAIL,
  get password() {
    return ownerPassword();
  },
};
const TEAMMATE = {
  email: 'sam.rivera@example.test',
  name: 'Sam Rivera',
  password: 'quiet-saffron-ladder-canyon-58',
};

test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function stepUpWithPassword(page: Page, password: string) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Confirm it is you' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Password').fill(password);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog).toBeHidden();
}

test('the owner invites a teammate, who accepts and sees only what the Member role allows', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one-time journey');
  await signIn(page, OWNER.email, OWNER.password);

  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Invite user' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Invite a person' });
  await dialog.getByLabel('Full name').fill(TEAMMATE.name);
  await dialog.getByLabel('Email').fill(TEAMMATE.email);
  await expect(dialog.getByLabel('Role 1', { exact: true })).toHaveValue(/./);
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await stepUpWithPassword(page, OWNER.password);
  const sent = page.getByRole('dialog').filter({ hasText: 'Invitation sent' });
  await expect(sent).toBeVisible();
  const link = (await sent.getByTestId('invite-link').textContent())!.trim();
  await sent.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: TEAMMATE.name })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'invited' })).toBeVisible();

  // The teammate accepts in a browser of their own.
  const context = await browser.newContext({ ...testInfo.project.use });
  const them = await context.newPage();
  await them.goto(link);
  await expect(them.getByRole('heading', { name: 'Welcome, Sam' })).toBeVisible();
  await expectAccessible(them);
  await them.getByLabel('Choose a password').fill(TEAMMATE.password);
  await them.getByLabel('Type it again').fill(TEAMMATE.password);
  await them.getByRole('button', { name: 'Create my account' }).click();
  await expect(them.getByText('Your account is ready')).toBeVisible();
  await them.getByRole('link', { name: 'Sign in' }).click();
  await them.getByLabel('Email').fill(TEAMMATE.email);
  await them.getByLabel('Password', { exact: true }).fill(TEAMMATE.password);
  await them.getByRole('button', { name: 'Sign in' }).click();
  await expect(them).toHaveURL(/\/dashboard$/);
  // Member: Users is visible (users.read), Roles is not
  await expect(
    them.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' }),
  ).toBeVisible();
  await expect(
    them.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Roles' }),
  ).toHaveCount(0);
  await them.goto('/admin/roles');
  await expect(them).toHaveURL(/\/dashboard$/);
  await context.close();

  // The owner sees them active and opens their page.
  await page.goto('/admin/users');
  await page.getByRole('link', { name: TEAMMATE.name }).click();
  await expect(page.getByRole('heading', { name: TEAMMATE.name, level: 2 })).toBeVisible();
  await expect(page.getByText('active', { exact: true })).toBeVisible();
  await expectAccessible(page);
});

test('the permission matrix: the Super Admin column is fixed, a built-in role can be edited with step-up and reset', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'phone',
    'the matrix is tested at tablet and desktop widths; phones show one role at a time',
  );
  await signIn(page, OWNER.email, OWNER.password);
  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();
  await expect(page.getByText('All').first()).toBeVisible();
  await expectAccessible(page);

  const matrix = page.locator('.hidden.md\\:block table');
  const box = matrix.getByRole('checkbox', { name: 'Viewer: View users' });
  await expect(box).not.toBeChecked();
  await box.check();
  await matrix.getByRole('button', { name: 'Save' }).nth(2).click(); // Administrator, Member, Viewer -> index 2 is Viewer
  await stepUpWithPassword(page, OWNER.password);
  await expect(page.getByText('Viewer saved.')).toBeVisible();
  await expect(page.getByText('Customised').first()).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await matrix.getByRole('button', { name: 'Reset to default' }).nth(2).click();
  await expect(page.getByText('Viewer is back to its default.')).toBeVisible();
  await expect(matrix.getByRole('checkbox', { name: 'Viewer: View users' })).not.toBeChecked();

  // reserved rows are locked for every editable role
  await expect(
    matrix.getByRole('checkbox', { name: 'Administrator: Manage roles' }),
  ).toBeDisabled();
});
