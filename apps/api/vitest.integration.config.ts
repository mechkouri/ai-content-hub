import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests: real PostgreSQL (embedded locally, service container in CI), real Prisma,
// real NestJS HTTP stack through Supertest. Only external services are replaced.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.int.spec.ts'],
    globalSetup: ['test/helpers/global-setup.ts'],
    setupFiles: ['test/helpers/env.ts'],
    // All files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
