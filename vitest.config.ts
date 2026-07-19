import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#plugin': fileURLToPath(new URL('./packages/uimatch-cli/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-types/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', '**/__tests__/**'],
    },
  },
});
