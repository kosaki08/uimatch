import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  shims: true,
  external: ['#/*'],
  // Replace Bun shebang with Node shebang in CLI for npm distribution
  esbuildPlugins: [
    {
      name: 'shebang-replacer',
      setup(build) {
        build.onLoad({ filter: /cli\/index\.ts$/ }, async (args) => {
          const fs = await import('fs/promises');
          const contents = await fs.readFile(args.path, 'utf8');
          // Replace Bun shebang with Node shebang
          return {
            contents: contents.replace(/^#!\/usr\/bin\/env bun/, '#!/usr/bin/env node'),
            loader: 'ts',
          };
        });
      },
    },
  ],
});
