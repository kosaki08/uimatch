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
});
