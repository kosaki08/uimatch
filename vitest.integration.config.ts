import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#plugin': fileURLToPath(new URL('./packages/uimatch-cli/src', import.meta.url)),
      '@uimatch/selector-anchors': fileURLToPath(
        new URL('./packages/uimatch-selector-anchors/src/index.ts', import.meta.url)
      ),
      '@uimatch/selector-spi': fileURLToPath(
        new URL('./packages/uimatch-selector-spi/src/index.ts', import.meta.url)
      ),
      '@uimatch/core': fileURLToPath(
        new URL('./packages/uimatch-core/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    bail: 1,
    testTimeout: 60_000,
    include: [
      'packages/**/*.integration.test.ts',
      'e2e/cli/**/*.e2e.test.ts',
      'e2e/commands/**/*.e2e.test.ts',
      'e2e/core/**/*.e2e.test.ts',
      'e2e/*.e2e.test.ts',
    ],
  },
});
