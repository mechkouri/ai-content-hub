import { expect, test } from './fixtures';
import { newUser, signIn } from './helpers';

test.describe('signed-out navigation', () => {
  test('protected pages redirect to login and keep the destination', async ({ page }) => {
    await page.goto('/brand');
    await expect(page).toHaveURL(/\/login\?next=%2Fbrand$/);
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  });

  test('login and signup pages link to each other', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.locator('form')).toBeVisible();
  });

  test('the login form refuses to submit without an email and password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    const valid = await page
      .getByPlaceholder('Email')
      .evaluate((el) => (el as HTMLInputElement).validity.valid);
    expect(valid).toBe(false);
  });
});

test.describe('signed-in navigation', () => {
  test('a user without an organization is sent to onboarding', async ({ page, context }) => {
    await signIn(context, newUser('lonely'));
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { name: 'Create your organization' })).toBeVisible();
  });

  test('onboarding rejects a one-letter organization name', async ({ page, context }) => {
    await signIn(context, newUser('short'));
    await page.goto('/onboarding');
    await page.getByPlaceholder('Organization name').fill('A');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('the sidebar moves between the main sections', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'The sidebar is hidden below the md breakpoint (see TESTING.md).');
    await signIn(context, newUser('nav'));
    await page.goto('/onboarding');
    await page.getByPlaceholder('Organization name').fill('Nav Academy');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const nav = page.getByRole('navigation');
    await nav.getByRole('link', { name: 'Brand kit' }).click();
    await expect(page).toHaveURL(/\/brand$/);
    await expect(page.getByRole('heading', { name: 'Brand kit', level: 1 })).toBeVisible();

    await nav.getByRole('link', { name: 'Sources' }).click();
    await expect(page).toHaveURL(/\/sources$/);
    await expect(page.getByRole('heading', { name: 'Sources', level: 1 })).toBeVisible();

    await nav.getByRole('link', { name: 'Content studio' }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole('heading', { name: 'Content studio', level: 1 })).toBeVisible();

    await nav.getByRole('link', { name: 'Media library' }).click();
    await expect(page).toHaveURL(/\/media$/);

    await nav.getByRole('link', { name: 'Team' }).click();
    await expect(page).toHaveURL(/\/members$/);

    await nav.getByRole('link', { name: 'Overview' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    // Features that do not exist yet are visibly disabled, not clickable links.
    await expect(nav.getByText('Campaigns')).toHaveAttribute('aria-disabled', 'true');
    await expect(nav.getByRole('link', { name: 'Campaigns' })).toHaveCount(0);
  });

  test('log out returns to the login page and protects the app again', async ({
    page,
    context,
  }) => {
    // supabase-js also tells its server about the sign-out; there is no server here.
    await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204 }));
    await signIn(context, newUser('logout'));
    await page.goto('/onboarding');
    await page.getByPlaceholder('Organization name').fill('Logout Academy');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Log out' }).click();
    // The shell may redirect with ?next=/dashboard before the explicit redirect lands.
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe('responsive layout', () => {
  test('no page scrolls horizontally', async ({ page, context }) => {
    await signIn(context, newUser('layout'));
    await page.goto('/onboarding');
    await page.getByPlaceholder('Organization name').fill('Layout Academy');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    for (const path of ['/dashboard', '/sources', '/studio', '/brand', '/media', '/members']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect({ path, overflow }).toEqual({ path, overflow: 0 });
    }
  });
});
