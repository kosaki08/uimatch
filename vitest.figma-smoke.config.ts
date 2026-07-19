import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    bail: 1,
    testTimeout: 240_000,
    hookTimeout: 30_000,
    include: ['e2e/figma/**/*.figma-smoke.test.ts'],
  },
});
