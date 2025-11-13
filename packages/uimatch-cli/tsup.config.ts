import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  outDir: 'dist',
  // Disable default shims to inject createRequire for dynamic require support
  shims: false,
  platform: 'node',
  // Bundle internal dependencies for easy distribution
  noExternal: [
    '@uimatch/core',
    '@uimatch/scoring',
    '@uimatch/selector-spi',
    '@uimatch/shared-logging',
  ],
  // External dependencies that should not be bundled
  external: [
    'playwright',
    'chromium-bidi',
    // Dependencies with native modules or dynamic requires
    'pngjs',
    'pixelmatch',
  ],
  // Inject createRequire for ESM compatibility with CJS dynamic requires (pngjs, etc.)
  banner: {
    js: `#!/usr/bin/env node
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);`,
  },
  // Configure esbuild to replace #plugin/* with relative paths for runtime compatibility
  esbuildOptions(options) {
    options.alias = options.alias || {};
    // Map #plugin/* to src/* at build time (esbuild will resolve to relative paths)
    options.alias['#plugin'] = './src';
  },
});
