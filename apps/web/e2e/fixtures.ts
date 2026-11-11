import { expect, test as base } from '@playwright/test';

interface Fixtures {
  /** HTTP statuses a test deliberately provokes; the browser logs those as console errors. */
  allowedHttpErrors: number[];
  consoleErrors: string[];
}

/** Every test fails on uncaught page errors and unexpected console errors. */
export const test = base.extend<Fixtures>({
  // Playwright requires the object-destructuring form, even when no fixture is requested.
  // eslint-disable-next-line no-empty-pattern
  allowedHttpErrors: async ({}, use) => {
    await use([]);
  },
  consoleErrors: [
    async ({ page, allowedHttpErrors }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const status = /status of (\d{3})/.exec(m.text())?.[1];
        if (status && allowedHttpErrors.includes(Number(status))) return;
        errors.push(`console: ${m.text()}`);
      });
      await use(errors);
      expect(errors, 'browser console errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
