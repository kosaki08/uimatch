/** Verify that public tarballs work from an isolated consumer project. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
import {
  getSettings,
  UiMatchError,
  type CompareArgs,
  type CompareResult,
  type UiMatchErrorCode,
} from '@uimatch/cli';
import selectorPlugin from '@uimatch/selector-anchors';
import { ResolutionSchema, type SelectorResolverPlugin } from '@uimatch/selector-spi';
import { createLogger } from '@uimatch/shared-logging';

const plugin: SelectorResolverPlugin = selectorPlugin;
const args: CompareArgs = { figma: 'file:node', story: 'https://example.com', selector: '#root' };
const result: Pick<CompareResult, 'summary'> = { summary: 'ok' };
const resolution = ResolutionSchema.parse({ selector: args.selector, stabilityScore: 100 });
const errorCode: UiMatchErrorCode = 'UIMATCH_SELECTOR_NOT_FOUND';

void getSettings;
void plugin;
void result;
void resolution;
void createLogger;
void UiMatchError;
void errorCode;
`
    );

    await execFileAsync('pnpm', ['add', ...tarballs, 'playwright@1.56.1', 'typescript@5.9.3'], {
      cwd: consumerDirectory,
    });

    // skipLibCheck lets tsc ignore this, so grep the published types instead:
    // they must not import the private engine packages a consumer cannot install.
    const cliRoot = join(consumerDirectory, 'node_modules', '@uimatch', 'cli');
    for (const declaration of ['dist/index.d.ts', 'dist/cli/index.d.ts']) {
      const contents = await readFile(join(cliRoot, declaration), 'utf8');
      const privateImport =
        /(?:from\s+|import\s*\()\s*['"]@uimatch\/(?:core|scoring)(?:\/[^'"]*)?['"]/.exec(contents);
      expect(
        privateImport,
        `${declaration} references a private package: ${privateImport?.[0]}`
      ).toBeNull();
    }
    const anchorsSchema = JSON.parse(
      await readFile(
        join(
          consumerDirectory,
          'node_modules',
          '@uimatch',
          'selector-anchors',
          'schema',
          'anchors.schema.json'
        ),
        'utf8'
      )
    ) as unknown;
    expect(anchorsSchema).toMatchObject({
      title: 'Selector Anchors',
      type: 'object',
    });
    await execFileAsync('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: consumerDirectory });
    await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          const { UiMatchError, uiMatchCompare } = await import('@uimatch/cli');
          await Promise.all([
            import('@uimatch/selector-anchors'),
            import('@uimatch/selector-spi'),
            import('@uimatch/shared-logging'),
          ]);
          if (!(new UiMatchError('UIMATCH_SELECTOR_NOT_FOUND', 'x') instanceof Error)) {
            throw new Error('UiMatchError does not extend Error');
          }
          // The class an error is thrown with inside the bundle must be the same
          // one the package exports, or a consumer's instanceof check would fail.
          let thrown;
          try {
            await uiMatchCompare({
              figma: 'AbCdEf123:',
              story: 'data:text/html,<div id="root"></div>',
              selector: '#root',
            });
          } catch (error) {
            thrown = error;
          }
          if (!(thrown instanceof UiMatchError)) throw new Error('thrown error is not the exported UiMatchError');
          if (thrown.code !== 'UIMATCH_CONFIG_INVALID_FIGMA_REF') throw new Error('unexpected code: ' + thrown.code);
          if (thrown.category !== 'usage') throw new Error('unexpected category: ' + thrown.category);
        `,
      ],
      // Clear the Figma bypass/token so the invalid reference is actually reached.
      {
        cwd: consumerDirectory,
        env: { ...process.env, UIMATCH_FIGMA_PNG_B64: '', FIGMA_ACCESS_TOKEN: '' },
      }
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
