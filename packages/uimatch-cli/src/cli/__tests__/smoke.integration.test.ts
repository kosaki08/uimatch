/**
 * P0 CLI smoke integration tests
 * Purpose: Detect crashes, hangs, and non-reproducibility
 * Runs against the built CLI in the serial integration suite.
 */

import { globby } from 'globby';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { cliProcessArgs } from '../../../../../test-utils/run-cli.js';

// Minimal 10x10 red square PNG (base64)
const MINIMAL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

// Simple HTML fixture for story (URL encoded to avoid shell issues)
const MINIMAL_HTML = `data:text/html,${encodeURIComponent('<div id="target" style="width:10px;height:10px;background:red"></div>')}`;

function runCli(args: readonly string[], env: NodeJS.ProcessEnv): string {
  return execFileSync(process.execPath, cliProcessArgs(args), {
    env,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

let testTmpDir: string;

beforeAll(() => {
  // Create temp directory for test outputs
  testTmpDir = join(tmpdir(), `uimatch-smoke-${Date.now()}`);
  mkdirSync(testTmpDir, { recursive: true });
});

afterAll(() => {
  // Clean up temp directory
  try {
    rmSync(testTmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

/**
 * CLI Smoke (no crash)
 * Purpose: Verify the command does not crash and outputs summary with exit code 0
 */
test('CLI smoke (no crash)', () => {
  const env = {
    ...process.env,
    UIMATCH_FIGMA_PNG_B64: MINIMAL_PNG_B64,
    NODE_ENV: 'test',
  };

  let stdout: string;
  try {
    stdout = runCli(
      [
        'compare',
        'figma=bypass:test',
        `story=${MINIMAL_HTML}`,
        'selector=#target',
        'size=pad',
        'dpr=1',
      ],
      env
    );
  } catch (error: unknown) {
    const execError = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
    const stdoutStr = execError.stdout?.toString() ?? '';
    const stderrStr = execError.stderr?.toString() ?? '';
    throw new Error(
      `CLI crashed with exit code ${execError.status}\nstdout: ${stdoutStr}\nstderr: ${stderrStr}`
    );
  }

  // Validate output contains summary markers (adjust based on your actual output)
  expect(stdout).toContain('DFS');
  expect(stdout.length).toBeGreaterThan(10); // Non-empty output
});

/**
 * Deterministic report (reproducibility)
 * Purpose: Same input → same output (detect potential hangs/flakes)
 * Masks dynamic fields (timestamp/timing) for deep comparison
 */
test('deterministic report', { timeout: 20000 }, async () => {
  const env = {
    ...process.env,
    UIMATCH_FIGMA_PNG_B64: MINIMAL_PNG_B64,
    NODE_ENV: 'test',
  };

  const outDirA = join(testTmpDir, 'deterministic-a');
  const outDirB = join(testTmpDir, 'deterministic-b');

  mkdirSync(outDirA, { recursive: true });
  mkdirSync(outDirB, { recursive: true });

  // Run twice with different output directories
  const baseArgs = [
    'compare',
    'figma=bypass:test',
    `story=${MINIMAL_HTML}`,
    'selector=#target',
    'size=pad',
    'dpr=1',
    '--no-screenshots',
  ];
  runCli([...baseArgs, '--out-dir', outDirA], env);
  runCli([...baseArgs, '--out-dir', outDirB], env);

  // Find the report.json files (may be in subdirectories)

  const reportsA = await globby(['**/report*.json'], { cwd: outDirA });

  const reportsB = await globby(['**/report*.json'], { cwd: outDirB });

  expect(reportsA.length).toBeGreaterThan(0);
  expect(reportsB.length).toBeGreaterThan(0);

  const reportPathA: string | undefined = reportsA[0];
  const reportPathB: string | undefined = reportsB[0];
  if (!reportPathA || !reportPathB) {
    throw new Error('Report files not found in output directories');
  }

  const reportA = JSON.parse(readFileSync(join(outDirA, reportPathA), 'utf8')) as Record<
    string,
    unknown
  >;
  const reportB = JSON.parse(readFileSync(join(outDirB, reportPathB), 'utf8')) as Record<
    string,
    unknown
  >;

  // Normalize: remove dynamic fields
  const normalize = (r: Record<string, unknown>): Record<string, unknown> => {
    const copy = structuredClone(r);
    delete copy.timestamp;
    delete copy.timing;
    if (typeof copy.selectorResolution === 'object' && copy.selectorResolution !== null) {
      const sr = copy.selectorResolution as Record<string, unknown>;
      delete sr.reasons;
      delete sr.updatedAnchors;
    }
    return copy;
  };

  const normalizedA = normalize(reportA);
  const normalizedB = normalize(reportB);

  expect(normalizedA).toEqual(normalizedB);
});

/**
 * Representative E2E passes once
 * Purpose: Verify Playwright path works (focus on "it runs" rather than strictness)
 */
test('representative E2E passes', { timeout: 20000 }, async () => {
  const outDir = join(testTmpDir, 'e2e-smoke');
  mkdirSync(outDir, { recursive: true });

  const env = {
    ...process.env,
    UIMATCH_FIGMA_PNG_B64: MINIMAL_PNG_B64,
    NODE_ENV: 'test',
  };

  const stdout = runCli(
    [
      'compare',
      'figma=bypass:test',
      `story=${MINIMAL_HTML}`,
      'selector=#target',
      'size=pad',
      'dpr=1',
      '--out-dir',
      outDir,
    ],
    env
  );

  expect(stdout).toContain('DFS');

  // Check that required artifacts exist (PNG screenshots and JSON report)

  const paths = await globby(['**/*.png', '**/report*.json'], { cwd: outDir });

  // Verify that at least one PNG and one report JSON were generated
  expect(paths.some((p) => p.endsWith('.png'))).toBe(true);
  expect(paths.some((p) => p.endsWith('.json'))).toBe(true);
});
