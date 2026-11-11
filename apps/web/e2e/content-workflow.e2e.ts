import { expect, test } from './fixtures';
import { newUser, signIn } from './helpers';

// The only content-authoring UI that exists today is the brand kit (the AI content studio and
// campaigns arrive in later features). These are full user journeys through it, against the
// real API and database.
test.describe('organization + brand kit workflow', () => {
  test('create an organization, save brand kit versions, reload, and switch the active one', async ({
    page,
    context,
  }) => {
    await signIn(context, newUser('workflow'));
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding$/);

    // 1. Onboarding creates the organization (real POST /organizations).
    await page.getByPlaceholder('Organization name').fill('Workflow Academy');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Workflow Academy' })).toBeVisible();
    await expect(page.getByText('OWNER', { exact: true })).toBeVisible();

    // 2. Empty state of the brand kit.
    await page.goto('/brand');
    await expect(page.getByText(/No brand kit yet/)).toBeVisible();
    await expect(page.getByText('None yet.')).toBeVisible();

    // 3. Save version 1.
    await page.getByLabel('Description').fill('We teach the future.');
    await page.getByPlaceholder('Version label (optional)').fill('Launch');
    await page.getByRole('button', { name: 'Save as new version' }).click();
    await expect(page.getByText('Saved as version 1 and set active.')).toBeVisible();

    // 4. Persistence: after a full reload the saved data comes back from the API.
    await page.reload();
    await expect(page.getByText(/Active: version 1\./)).toBeVisible();
    await expect(page.getByLabel('Description')).toHaveValue('We teach the future.');
    await expect(page.getByText('Launch')).toBeVisible();

    // 5. Version 2 becomes active; version 1 can be restored with "Use".
    await page.getByLabel('Description').fill('Second edition.');
    await page.getByRole('button', { name: 'Save as new version' }).click();
    await expect(page.getByText('Saved as version 2 and set active.')).toBeVisible();
    await expect(page.getByText(/Active: version 2\./)).toBeVisible();
    await page.getByRole('button', { name: 'Use' }).click();
    await expect(page.getByText(/Active: version 1\./)).toBeVisible();
  });

  test('shows the validation error returned by the API and saves nothing', async ({
    page,
    context,
    allowedHttpErrors,
  }) => {
    allowedHttpErrors.push(400); // the 400 below is the behavior under test
    await signIn(context, newUser('invalid'));
    await page.goto('/onboarding');
    await page.getByPlaceholder('Organization name').fill('Invalid Academy');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/brand');
    // Bypass the browser's own URL check so the server-side validation is what answers.
    await page.locator('form').evaluate((f) => ((f as HTMLFormElement).noValidate = true));
    await page.getByLabel('Website').fill('not a url');
    await page.getByRole('button', { name: 'Save as new version' }).click();
    await expect(page.locator('p.bg-red-50')).toBeVisible();
    await page.reload();
    await expect(page.getByText(/No brand kit yet/)).toBeVisible();
  });

  test("a second user cannot see the first user's organization", async ({ browser }) => {
    const ctxA = await browser.newContext();
    await signIn(ctxA, newUser('alice'));
    const pageA = await ctxA.newPage();
    await pageA.goto('/onboarding');
    await pageA.getByPlaceholder('Organization name').fill('Alice Private School');
    await pageA.getByRole('button', { name: /create/i }).click();
    await expect(pageA.getByRole('heading', { name: 'Alice Private School' })).toBeVisible();
    await ctxA.close();

    const ctxB = await browser.newContext();
    await signIn(ctxB, newUser('bob'));
    const pageB = await ctxB.newPage();
    await pageB.goto('/dashboard');
    await expect(pageB).toHaveURL(/\/onboarding$/);
    await expect(pageB.getByText('Alice Private School')).toHaveCount(0);
    await ctxB.close();
  });
});
