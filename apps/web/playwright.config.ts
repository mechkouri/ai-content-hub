import { defineConfig, devices } from '@playwright/test';
import { JWT_SECRET, SUPABASE_URL } from './e2e/helpers';

const WEB = 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: WEB, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node e2e/stack.mjs',
      url: 'http://localhost:4100/api/health',
      timeout: 180_000,
      reuseExistingServer: false,
      env: { E2E_JWT_SECRET: JWT_SECRET },
    },
    {
      command: 'pnpm exec next dev -p 3100',
      url: `${WEB}/login`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: 'http://localhost:4100/api',
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
      },
    },
  ],
});
