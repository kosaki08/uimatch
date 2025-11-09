/**
 * P0 Smoke Tests - Fast validation of critical paths
 * Purpose: Detect crashes, hangs, and non-reproducibility
 * Target: < 200ms per test, run on every PR
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Minimal 10x10 red square PNG (base64)
const MINIMAL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

// Simple HTML fixture for story (URL encoded to avoid shell issues)
const MINIMAL_HTML = `data:text/html,${encodeURIComponent('<div id="target" style="width:10px;height:10px;background:red"></div>')}`;

// Path to CLI entry - use bun to run the built CLI
const CLI_PATH = join(__dirname, '../../../src/cli/index.ts');

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

  const cmd = `bun "${CLI_PATH}" compare figma=bypass:test story="${MINIMAL_HTML}" selector="#target" size=pad dpr=1`;

  let stdout: string;
  try {
    stdout = execSync(cmd, { env, encoding: 'utf8', stdio: 'pipe' });
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
test('deterministic report', () => {
  const env = {
    ...process.env,
    UIMATCH_FIGMA_PNG_B64: MINIMAL_PNG_B64,
    NODE_ENV: 'test',
  };

  const outDirA = join(testTmpDir, 'deterministic-a');
  const outDirB = join(testTmpDir, 'deterministic-b');

  mkdirSync(outDirA, { recursive: true });
  mkdirSync(outDirB, { recursive: true });

  const cmdBase = `bun "${CLI_PATH}" compare figma=bypass:test story="${MINIMAL_HTML}" selector="#target" size=pad dpr=1 --no-screenshots`;

  // Run twice with different output directories
  execSync(`${cmdBase} --out-dir "${outDirA}"`, { env, encoding: 'utf8', stdio: 'pipe' });
  execSync(`${cmdBase} --out-dir "${outDirB}"`, { env, encoding: 'utf8', stdio: 'pipe' });

  const reportA = JSON.parse(readFileSync(join(outDirA, 'report.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const reportB = JSON.parse(readFileSync(join(outDirB, 'report.json'), 'utf8')) as Record<
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
test('representative E2E passes', () => {
  const outDir = join(testTmpDir, 'e2e-smoke');
  mkdirSync(outDir, { recursive: true });

  const env = {
    ...process.env,
    UIMATCH_FIGMA_PNG_B64: MINIMAL_PNG_B64,
    NODE_ENV: 'test',
  };

  const cmd = `bun "${CLI_PATH}" compare figma=bypass:test story="${MINIMAL_HTML}" selector="#target" size=pad dpr=1 --out-dir "${outDir}"`;

  const stdout = execSync(cmd, { env, encoding: 'utf8', stdio: 'pipe' });

  expect(stdout).toContain('DFS');

  // Find the timestamped subdirectory
  const subdirs = readdirSync(outDir).filter((name) => {
    const stat = statSync(join(outDir, name));
    return stat.isDirectory();
  });

  expect(subdirs.length).toBeGreaterThan(0);
  const subdir = subdirs[0];
  if (!subdir) {
    throw new Error('No subdirectory found in output directory');
  }
  const reportPath = join(outDir, subdir, 'report.json');
  expect(readFileSync(reportPath, 'utf8')).toBeTruthy();
});
