/** Verify that public tarballs work from an isolated consumer project. */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');

test('public package tarballs import, type-check, and run', { timeout: 120_000 }, async () => {
  const consumerDirectory = await mkdtemp(join(tmpdir(), 'uimatch-consumer-'));
  const packDirectory = await mkdtemp(join(tmpdir(), 'uimatch-pack-'));

  try {
    await execFileAsync(
      process.execPath,
      [join(repositoryRoot, 'scripts', 'pack-public-packages.mjs'), packDirectory],
      { cwd: repositoryRoot }
    );

    const tarballs = (await readdir(packDirectory))
      .filter((name) => name.endsWith('.tgz'))
      .sort()
      .map((name) => join(packDirectory, name));
    const packageNames = tarballs.map((path) =>
      basename(path).replace(/-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.tgz$/, '')
    );
    expect(packageNames).toEqual([
      'uimatch-cli',
      'uimatch-selector-anchors',
      'uimatch-selector-spi',
      'uimatch-shared-logging',
    ]);

    await writeFile(
      join(consumerDirectory, 'package.json'),
      JSON.stringify({ name: 'uimatch-consumer-smoke', private: true, type: 'module' }, null, 2)
    );
    await writeFile(
      join(consumerDirectory, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            skipLibCheck: true,
          },
          include: ['consumer.ts'],
        },
        null,
        2
      )
    );
    await writeFile(
      join(consumerDirectory, 'consumer.ts'),
      `
import { getSettings, type CompareArgs, type CompareResult } from '@uimatch/cli';
import selectorPlugin from '@uimatch/selector-anchors';
import { ResolutionSchema, type SelectorResolverPlugin } from '@uimatch/selector-spi';
import { createLogger } from '@uimatch/shared-logging';

const plugin: SelectorResolverPlugin = selectorPlugin;
const args: CompareArgs = { figma: 'file:node', story: 'https://example.com', selector: '#root' };
const result: Pick<CompareResult, 'summary'> = { summary: 'ok' };
const resolution = ResolutionSchema.parse({ selector: args.selector, stabilityScore: 100 });

void getSettings;
void plugin;
void result;
void resolution;
void createLogger;
`
    );

    await execFileAsync('pnpm', ['add', ...tarballs, 'playwright@1.56.1', 'typescript@5.9.3'], {
      cwd: consumerDirectory,
    });
    await execFileAsync('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: consumerDirectory });
    await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "await Promise.all([import('@uimatch/cli'), import('@uimatch/selector-anchors'), import('@uimatch/selector-spi'), import('@uimatch/shared-logging')])",
      ],
      { cwd: consumerDirectory }
    );
    const { stdout } = await execFileAsync('pnpm', ['exec', 'uimatch', 'version'], {
      cwd: consumerDirectory,
    });
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  } finally {
    await Promise.all([
      rm(consumerDirectory, { recursive: true, force: true }),
      rm(packDirectory, { recursive: true, force: true }),
    ]);
  }
});
