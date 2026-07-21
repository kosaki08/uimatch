#!/usr/bin/env node
/**
 * Accept the packed tarballs the way a consumer installs them.
 *
 * The Vitest suites install with pnpm, which only warns when a peer cannot be
 * satisfied. npm drops the package instead, so an inconsistent package graph
 * only shows up here.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const RED_10X10_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
const STORY =
  'data:text/html,<style>html,body{margin:0}</style><div id="t" style="width:10px;height:10px;background:red"></div>';
const EXPECTED_PACKAGES = [
  '@uimatch/cli',
  '@uimatch/selector-anchors',
  '@uimatch/selector-spi',
  '@uimatch/shared-logging',
];
const EXIT_TIMEOUT_MS = 120_000;
const REPOSITORY_URL = 'git+https://github.com/kosaki08/uimatch.git';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const packDirectory = mkdtempSync(join(tmpdir(), 'uimatch-release-pack-'));
const consumer = mkdtempSync(join(tmpdir(), 'uimatch-release-consumer-'));

const consumerEnv = {
  ...process.env,
  UIMATCH_HEADLESS: 'true',
  UIMATCH_LOG_LEVEL: 'silent',
  UIMATCH_FIGMA_PNG_B64: RED_10X10_PNG_B64,
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: consumer,
    env: consumerEnv,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function expect(condition, message, detail) {
  if (condition) return;
  throw new Error(detail ? `${message}\n${detail}` : message);
}

try {
  console.log('packing');
  const packed = run(
    process.execPath,
    [join('scripts', 'pack-public-packages.mjs'), packDirectory],
    {
      cwd: repositoryRoot,
    }
  );
  expect(packed.status === 0, 'pack-public-packages failed', packed.stderr);

  const tarballs = readdirSync(packDirectory)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(packDirectory, name));
  expect(
    tarballs.length === EXPECTED_PACKAGES.length,
    `expected ${EXPECTED_PACKAGES.length} tarballs, found ${tarballs.length}`,
    tarballs.join('\n')
  );

  console.log('installing with npm');
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'uimatch-release-check', private: true, type: 'module' }, null, 2)
  );
  const install = run('npm', ['install', '--no-audit', '--no-fund', ...tarballs, 'playwright']);
  expect(install.status === 0, 'npm install failed', install.stderr);

  // npm reports an unsatisfiable peer as a warning and installs nothing for it.
  const installed = new Map();
  for (const name of EXPECTED_PACKAGES) {
    const path = join(consumer, 'node_modules', ...name.split('/'), 'package.json');
    let contents;
    try {
      contents = readFileSync(path, 'utf8');
    } catch {
      throw new Error(`${name} is missing from the install; check the peer ranges`);
    }
    expect(
      !contents.includes('workspace:'),
      `${name} still declares a workspace: dependency`,
      contents
    );

    const manifest = JSON.parse(contents);
    // npm refuses to attest provenance without a repository it can match.
    expect(
      manifest.repository?.url === REPOSITORY_URL,
      `${name} declares repository ${manifest.repository?.url ?? '(none)'}, expected ${REPOSITORY_URL}`
    );
    installed.set(name, manifest);
  }

  console.log('checking the selector plugin');
  // Written into the consumer so it resolves through the consumer's own tree.
  writeFileSync(
    join(consumer, 'health.mjs'),
    `import plugin from '@uimatch/selector-anchors';
const health = await plugin.healthCheck();
if (!health?.healthy) { console.error(JSON.stringify(health)); process.exit(1); }
`
  );
  const health = run(process.execPath, ['health.mjs']);
  expect(health.status === 0, 'selector plugin health check failed', health.stderr);

  console.log('running the CLI');
  const cli = join(consumer, 'node_modules', '.bin', 'uimatch');
  const version = run(cli, ['version']);
  expect(version.status === 0, 'uimatch version failed', version.stderr);
  const expectedVersion = installed.get('@uimatch/cli').version;
  expect(
    version.stdout.includes(expectedVersion),
    `the CLI reports ${version.stdout.trim()}, expected ${expectedVersion}`
  );
  console.log(`  ${version.stdout.trim()}`);

  const pass = run(cli, [
    'compare',
    'figma=bypass:test',
    `story=${STORY}`,
    'selector=#t',
    'viewport=50x50',
    'dpr=1',
    'size=pad',
  ]);
  expect(pass.status === 0, `a passing comparison exited with ${pass.status}`, pass.stderr);

  const missing = run(
    cli,
    [
      'compare',
      'figma=bypass:test',
      `story=${STORY}`,
      'selector=#absent',
      'viewport=50x50',
      'dpr=1',
    ],
    { env: { ...consumerEnv, UIMATCH_SELECTOR_WAIT_MS: '1500' } }
  );
  expect(missing.status === 1, `a missing selector exited with ${missing.status}`, missing.stderr);
  expect(
    missing.stderr.includes('UIMATCH_SELECTOR_NOT_FOUND'),
    'a missing selector did not report its error code',
    missing.stderr
  );

  console.log('running the programmatic API');
  writeFileSync(
    join(consumer, 'programmatic.mjs'),
    `import { uiMatchCompare } from '@uimatch/cli';
const result = await uiMatchCompare({
  figma: 'bypass:test',
  story: ${JSON.stringify(STORY)},
  selector: '#t',
  sizeMode: 'pad',
  viewport: { width: 50, height: 50 },
  dpr: 1,
});
process.stdout.write(result.summary);
`
  );

  // A leaked browser shows up as a process that never exits, not as a bad result.
  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['programmatic.mjs'], {
      cwd: consumer,
      env: consumerEnv,
      stdio: 'inherit',
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectPromise(new Error('the programmatic API did not exit; a browser was left running'));
    }, EXIT_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolvePromise(code);
    });
  });
  expect(exitCode === 0, `the programmatic API exited with ${exitCode}`);

  console.log('\nDistribution verified');
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(packDirectory, { recursive: true, force: true });
  rmSync(consumer, { recursive: true, force: true });
}
