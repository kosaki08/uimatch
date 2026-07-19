import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
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
      'packages/uimatch-cli/src/cli/__tests__/smoke.test.ts',
      'e2e/cli/outdir.e2e.test.ts',
      'e2e/commands/selector-resolution.e2e.test.ts',
    ],
  },
});
