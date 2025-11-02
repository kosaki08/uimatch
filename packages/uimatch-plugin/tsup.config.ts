import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  shims: true,
  // Bundle internal dependencies for easy distribution
  noExternal: ['uimatch-core', 'uimatch-scoring', '@uimatch/selector-spi'],
  // External dependencies that should not be bundled
  external: ['playwright', 'chromium-bidi'],
  // Add Node shebang for CLI distribution (works with both Node and Bun)
  banner: { js: '#!/usr/bin/env node' },
  // Configure esbuild to replace #plugin/* with relative paths for runtime compatibility
  esbuildOptions(options) {
    options.alias = options.alias || {};
    // Map #plugin/* to src/* at build time (esbuild will resolve to relative paths)
    options.alias['#plugin'] = './src';
  },
});
