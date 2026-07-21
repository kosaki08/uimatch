/**
 * Exit code contract for the CLI entry point.
 * `0` gate pass, `1` comparison failure, `2` invalid invocation.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  BLUE_TARGET_STORY_URL,
  BROWSER_FIXTURE_VIEWPORT_SIZE,
  RED_10X10_PNG_B64,
  RED_TARGET_STORY_URL,
} from '../../../../../test-utils/browser-fixtures.js';
import { cliProcessArgs } from '../../../../../test-utils/run-cli.js';
const tempDirectories: string[] = [];

const VIEWPORT_ARG = `viewport=${BROWSER_FIXTURE_VIEWPORT_SIZE}x${BROWSER_FIXTURE_VIEWPORT_SIZE}`;

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

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reports a passing quality gate with exit code 0', { timeout: 20_000 }, () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=bypass:test',
      `story=${RED_TARGET_STORY_URL}`,
      'selector=#target',
      'size=pad',
      VIEWPORT_ARG,
      'dpr=1',
    ]),
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        UIMATCH_FIGMA_PNG_B64: RED_10X10_PNG_B64,
        UIMATCH_LOG_LEVEL: 'silent',
      },
      timeout: 15_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Gate: ✅ PASS');
});

test('reports a missing Figma token as a usage error', () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=AbCdEf123:1-2',
      `story=${RED_TARGET_STORY_URL}`,
      'selector=#target',
    ]),
    { encoding: 'utf8', env: envWithoutFigmaCredentials(), timeout: 30_000 }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('❌ Error [UIMATCH_CONFIG_MISSING_FIGMA_TOKEN]:');
});

test('reports an unusable Figma reference as a usage error', () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=not-a-figma-reference',
      `story=${RED_TARGET_STORY_URL}`,
      'selector=#target',
    ]),
    { encoding: 'utf8', env: envWithoutFigmaCredentials(), timeout: 30_000 }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('❌ Error [UIMATCH_CONFIG_INVALID_FIGMA_REF]:');
});

test('reports a missing selector as a comparison failure', { timeout: 30_000 }, () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=bypass:test',
      `story=${RED_TARGET_STORY_URL}`,
      'selector=#not-in-the-page',
      'size=pad',
      VIEWPORT_ARG,
      'dpr=1',
    ]),
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        UIMATCH_FIGMA_PNG_B64: RED_10X10_PNG_B64,
        UIMATCH_LOG_LEVEL: 'silent',
        UIMATCH_SELECTOR_WAIT_MS: '1500',
      },
      timeout: 25_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('❌ Error [UIMATCH_SELECTOR_NOT_FOUND]:');
});

test('reports a strict-mode size mismatch as a comparison failure', { timeout: 20_000 }, () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=bypass:test',
      `story=${RED_TARGET_STORY_URL}`,
      'selector=#target',
      'size=strict',
      VIEWPORT_ARG,
      // The fixture element is 10x10 CSS pixels, so dpr=2 captures 20x20
      // against the 10x10 Figma PNG.
      'dpr=2',
    ]),
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        UIMATCH_FIGMA_PNG_B64: RED_10X10_PNG_B64,
        UIMATCH_LOG_LEVEL: 'silent',
      },
      timeout: 15_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('❌ Error [UIMATCH_IMAGE_SIZE_MISMATCH]:');
});

test('rejects an unknown command', () => {
  const result = spawnSync(process.execPath, cliProcessArgs(['no-such-command']), {
    encoding: 'utf8',
    env: { ...process.env, UIMATCH_LOG_LEVEL: 'silent' },
    timeout: 30_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('Unknown command: no-such-command');
});

test('claude format preserves a failing quality gate exit code', { timeout: 20_000 }, () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=bypass:test',
      `story=${BLUE_TARGET_STORY_URL}`,
      'selector=#target',
      'size=pad',
      `viewport=${BROWSER_FIXTURE_VIEWPORT_SIZE}x${BROWSER_FIXTURE_VIEWPORT_SIZE}`,
      'dpr=1',
      'format=claude',
    ]),
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        UIMATCH_FIGMA_PNG_B64: RED_10X10_PNG_B64,
        UIMATCH_LOG_LEVEL: 'silent',
      },
      timeout: 15_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('=== LLM-Formatted Output ===');
  expect(result.stderr).toContain('Gate: ❌ FAIL');
});

test('rejects an unknown quality gate profile before comparison', () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=bypass:test',
      `story=${BLUE_TARGET_STORY_URL}`,
      'selector=#target',
      'profile=does-not-exist',
    ]),
    {
      encoding: 'utf8',
      env: { ...process.env, UIMATCH_LOG_LEVEL: 'silent' },
      timeout: 30_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("Quality gate profile 'does-not-exist' not found");
});

test('rejects an invalid area gap threshold before comparison', () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=bypass:test',
      `story=${BLUE_TARGET_STORY_URL}`,
      'selector=#target',
      'areaGapCritical=0.1junk',
    ]),
    {
      encoding: 'utf8',
      env: { ...process.env, UIMATCH_LOG_LEVEL: 'silent' },
      timeout: 30_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('Invalid areaGapCritical');
});

test('rejects selector anchors outside the project root before comparison', () => {
  const parent = mkdtempSync(join(tmpdir(), 'uimatch-cli-project-root-'));
  tempDirectories.push(parent);
  const projectRoot = join(parent, 'project');
  mkdirSync(join(projectRoot, '.git'), { recursive: true });
  writeFileSync(join(parent, 'outside.json'), '{"version":"1.0.0","anchors":[]}');

  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=bypass:test',
      `story=${BLUE_TARGET_STORY_URL}`,
      'selector=#target',
      'selectors=../outside.json',
    ]),
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, UIMATCH_LOG_LEVEL: 'silent' },
      timeout: 30_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('selectors path must be inside project root');
});

test('rejects an invalid selector plugin timeout before comparison', () => {
  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'compare',
      'figma=bypass:test',
      `story=${BLUE_TARGET_STORY_URL}`,
      'selector=#target',
      'selectorsPlugin=@uimatch/selector-anchors',
    ]),
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        UIMATCH_LOG_LEVEL: 'silent',
        UIMATCH_SELECTOR_PLUGIN_TIMEOUT_MS: 'not-a-timeout',
      },
      timeout: 30_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('UIMATCH_SELECTOR_PLUGIN_TIMEOUT_MS must be a positive integer');
});
