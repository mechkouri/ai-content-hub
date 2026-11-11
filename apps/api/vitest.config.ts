import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit tests: fast, no database, external services mocked.
export default defineConfig({
  // NestJS needs decorator metadata, which esbuild does not emit; SWC does.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    clearMocks: false,
  },
});
