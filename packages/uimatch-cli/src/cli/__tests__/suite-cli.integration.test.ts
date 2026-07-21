import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  BROWSER_FIXTURE_VIEWPORT_SIZE,
  RED_10X10_PNG_B64,
  RED_TARGET_STORY_URL,
} from '../../../../../test-utils/browser-fixtures.js';
import { cliProcessArgs } from '../../../../../test-utils/run-cli.js';
const TEXT_GATE_WARNING =
  'textGate is enabled but textCheck is not active; using the visual quality gate.';
const tempDirs: string[] = [];

const VALID_ITEM = {
  name: 'should-not-run',
  figma: 'bypass:test',
  story: 'data:text/html,<div id="target"></div>',
  selector: '#target',
};
const VALID_SUITE = JSON.stringify({ items: [VALID_ITEM] });

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runSuiteCli(suiteContents: string, concurrency?: string, env?: NodeJS.ProcessEnv) {
  const tempDir = mkdtempSync(join(tmpdir(), 'uimatch-suite-validation-'));
  tempDirs.push(tempDir);

  const suitePath = join(tempDir, 'suite.json');
  const outDir = join(tempDir, 'out');
  writeFileSync(suitePath, suiteContents);

  const args = ['suite', `path=${suitePath}`, `outDir=${outDir}`];
  if (concurrency !== undefined) args.push(`concurrency=${concurrency}`);

  const result = spawnSync(process.execPath, cliProcessArgs(args), {
    encoding: 'utf8',
    env: env ?? {
      ...process.env,
      NODE_ENV: 'test',
      UIMATCH_FIGMA_PNG_B64: RED_10X10_PNG_B64,
      UIMATCH_LOG_LEVEL: 'silent',
    },
    timeout: 30_000,
  });

  return { ...result, outDir };
}

/** Strip every Figma credential so the missing-token path is reachable locally and in CI. */
function envWithoutFigmaCredentials(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    UIMATCH_LOG_LEVEL: 'silent',
  };
  delete env.FIGMA_ACCESS_TOKEN;
  delete env.UIMATCH_FIGMA_PNG_B64;
  return env;
}

test.each(['', 'auto', '0', '-1', '4abc', '1.5', '9007199254740992'])(
  'rejects invalid concurrency value %s',
  (concurrency) => {
    const result = runSuiteCli(VALID_SUITE, concurrency);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Invalid concurrency');
  }
);

test.each([JSON.stringify({}), JSON.stringify({ items: [] })])(
  'rejects missing or empty suite items',
  (suiteContents) => {
    const result = runSuiteCli(suiteContents);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('items must be a non-empty array');
  }
);

test('rejects malformed suite JSON', () => {
  const result = runSuiteCli('{"items":');

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('Invalid suite JSON');
});

test.each([
  [
    'defaults.textGate',
    JSON.stringify({
      defaults: { textGate: 'true' },
      items: [VALID_ITEM],
    }),
  ],
  [
    'items[0].textGate',
    JSON.stringify({
      items: [{ ...VALID_ITEM, textGate: 'true' }],
    }),
  ],
])('rejects non-boolean suite textGate at %s', (field, suiteContents) => {
  const result = runSuiteCli(suiteContents);

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain(`${field} must be a boolean`);
});

test.each([
  ['items[0].selector', JSON.stringify({ items: [{ ...VALID_ITEM, selector: undefined }] })],
  ['items[0].story', JSON.stringify({ items: [{ ...VALID_ITEM, story: '  ' }] })],
])('rejects a suite item missing %s', (field, suiteContents) => {
  const result = runSuiteCli(suiteContents);

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain(`${field} must be a non-empty string`);
});

test('rejects a suite that cannot reach Figma before running any item', () => {
  const suite = JSON.stringify({
    items: [{ ...VALID_ITEM, figma: 'AbCdEf123:1-2' }],
  });

  const result = runSuiteCli(suite, undefined, envWithoutFigmaCredentials());

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('❌ Suite error [UIMATCH_CONFIG_MISSING_FIGMA_TOKEN]:');
});

test('fails a suite item whose selector is missing', { timeout: 30_000 }, () => {
  const suite = JSON.stringify({
    items: [
      {
        name: 'missing-selector',
        figma: 'bypass:test',
        story: RED_TARGET_STORY_URL,
        selector: '#not-in-the-page',
        size: 'pad',
        dpr: 1,
        viewport: {
          width: BROWSER_FIXTURE_VIEWPORT_SIZE,
          height: BROWSER_FIXTURE_VIEWPORT_SIZE,
        },
      },
    ],
  });

  const result = runSuiteCli(suite, undefined, {
    ...process.env,
    NODE_ENV: 'test',
    UIMATCH_FIGMA_PNG_B64: RED_10X10_PNG_B64,
    UIMATCH_LOG_LEVEL: 'silent',
    UIMATCH_SELECTOR_WAIT_MS: '1500',
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);

  const report = JSON.parse(readFileSync(join(result.outDir, 'suite-report.json'), 'utf8')) as {
    items: Array<{ error?: string }>;
  };
  expect(report.items[0]?.error).toContain('not found or not visible');
});

test(
  'records a warning when textGate falls back to the visual quality gate',
  { timeout: 15_000 },
  () => {
    const suite = JSON.stringify({
      items: [
        {
          name: 'text-gate-fallback',
          figma: 'bypass:test',
          story: RED_TARGET_STORY_URL,
          selector: '#target',
          size: 'pad',
          dpr: 1,
          viewport: {
            width: BROWSER_FIXTURE_VIEWPORT_SIZE,
            height: BROWSER_FIXTURE_VIEWPORT_SIZE,
          },
          textGate: true,
        },
      ],
    });

    const result = runSuiteCli(suite);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(TEXT_GATE_WARNING);

    const report = JSON.parse(readFileSync(join(result.outDir, 'suite-report.json'), 'utf8')) as {
      items: Array<{ warnings?: string[] }>;
    };
    expect(report.items[0]?.warnings).toEqual([TEXT_GATE_WARNING]);
  }
);
