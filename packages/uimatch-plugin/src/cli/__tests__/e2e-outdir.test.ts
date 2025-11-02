import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { browserPool } from '../../../../uimatch-core/src/adapters/browser-pool.js';
import { runCompare } from '../compare.js';

// Type definitions for test report
interface TestReport {
  artifacts?: {
    figmaPngB64?: string;
    implPngB64?: string;
    diffPngB64?: string;
  };
}

describe('E2E: outDir artifact saving', () => {
  const testOutDir = join(import.meta.dir, 'fixtures', 'test-out');

  // A minimal 10x10 red PNG in base64 (for UIMATCH_FIGMA_PNG_B64 bypass)
  const RED_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

  beforeEach(async () => {
    // Clean test output directory
    await rm(testOutDir, { recursive: true, force: true });
    await mkdir(testOutDir, { recursive: true });

    // Set bypass mode environment variable
    process.env.UIMATCH_FIGMA_PNG_B64 = RED_PNG_B64;

    // Set internal timer defaults for E2E tests (to avoid timeout)
    process.env.UIMATCH_NAV_TIMEOUT_MS = process.env.UIMATCH_NAV_TIMEOUT_MS ?? '1500';
    process.env.UIMATCH_SELECTOR_WAIT_MS = process.env.UIMATCH_SELECTOR_WAIT_MS ?? '2000';
    process.env.UIMATCH_BBOX_TIMEOUT_MS = process.env.UIMATCH_BBOX_TIMEOUT_MS ?? '600';
    process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS = process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS ?? '800';
  });

  afterEach(async () => {
    // Clean up
    delete process.env.UIMATCH_FIGMA_PNG_B64;
    await rm(testOutDir, { recursive: true, force: true });
    // Small delay to ensure browser cleanup between tests
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    // Close all browsers to prevent hanging tests
    await browserPool.closeAll();
  });

  test(
    'should save artifacts when outDir is specified',
    async () => {
      // Simulate CLI invocation with outDir
      const argv = [
        'figma=bypass:test',
        'story=data:text/html,<div id="test" style="width:10px;height:10px;background:red"></div>',
        'selector=#test',
        `outDir=${testOutDir}`,
        'timestampOutDir=false',
        'size=pad', // Use pad mode to handle dimension mismatch
        'viewport=10x10', // Match the bypass PNG size
        'dpr=1', // Use dpr=1 for deterministic testing
      ];

      // Run compare (will exit process, so we need to catch)
      const originalExit = process.exit.bind(process);

      try {
        // Mock process.exit to prevent actual exit but allow async operations to complete
        const mockExit = (code?: number | string | null): never => {
          throw new Error(`EXIT_${code ?? 0}`);
        };
        process.exit = mockExit as typeof process.exit;

        // Run compare and wait for completion (will throw EXIT_0)
        await runCompare(argv);
      } catch (err) {
        // Expected exit throw
        if (!(err instanceof Error && err.message.startsWith('EXIT_'))) {
          throw err;
        }
      } finally {
        process.exit = originalExit;
        // Give sufficient delay for all file writes to complete
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Verify artifacts were saved
      const files = await readdir(testOutDir);

      expect(files).toContain('figma.png');
      expect(files).toContain('impl.png');
      expect(files).toContain('diff.png');
      expect(files).toContain('report.json');

      // Verify figma.png content matches bypass
      const figmaContent = await readFile(join(testOutDir, 'figma.png'));
      const figmaB64 = figmaContent.toString('base64');
      expect(figmaB64).toBe(RED_PNG_B64);

      // Verify report.json does NOT contain artifacts (jsonOnly=true default)
      const reportContent = await readFile(join(testOutDir, 'report.json'), 'utf-8');
      const report = JSON.parse(reportContent) as TestReport;

      expect(report.artifacts).toBeUndefined();
    },
    { timeout: 10000 }
  );

  test(
    'should include artifacts in JSON when jsonOnly=false',
    async () => {
      const argv = [
        'figma=bypass:test',
        'story=data:text/html,<div id="test" style="width:10px;height:10px;background:red"></div>',
        'selector=#test',
        `outDir=${testOutDir}`,
        'timestampOutDir=false',
        'jsonOnly=false',
        'size=pad',
        'viewport=10x10',
        'dpr=1',
      ];

      const originalExit = process.exit.bind(process);

      try {
        const mockExit = (code?: number | string | null): never => {
          throw new Error(`EXIT_${code ?? 0}`);
        };
        process.exit = mockExit as typeof process.exit;

        await runCompare(argv);
      } catch (err) {
        if (!(err instanceof Error && err.message.startsWith('EXIT_'))) {
          throw err;
        }
      } finally {
        process.exit = originalExit;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Verify report.json DOES contain artifacts
      const reportContent = await readFile(join(testOutDir, 'report.json'), 'utf-8');
      const report = JSON.parse(reportContent) as TestReport;

      expect(report.artifacts).toBeDefined();
      expect(report.artifacts?.figmaPngB64).toBeDefined();
      expect(report.artifacts?.implPngB64).toBeDefined();
      expect(report.artifacts?.diffPngB64).toBeDefined();
    },
    { timeout: 10000 }
  );

  test('should auto-enable emitArtifacts when outDir specified', async () => {
    // This test verifies the config builder auto-enables emitArtifacts
    // by checking that artifacts are actually saved (which requires emitArtifacts=true)
    const argv = [
      'figma=bypass:test',
      'story=data:text/html,<div id="test" style="width:10px;height:10px;background:red"></div>',
      'selector=#test',
      `outDir=${testOutDir}`,
      'timestampOutDir=false',
      'size=pad',
      'viewport=10x10',
      'dpr=1',
      // Note: NOT specifying emitArtifacts explicitly
    ];

    const originalExit = process.exit.bind(process);

    try {
      const mockExit = (code?: number | string | null): never => {
        throw new Error(`EXIT_${code ?? 0}`);
      };
      process.exit = mockExit as typeof process.exit;

      await runCompare(argv);
    } catch (err) {
      if (!(err instanceof Error && err.message.startsWith('EXIT_'))) {
        throw err;
      }
    } finally {
      process.exit = originalExit;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // If emitArtifacts was NOT auto-enabled, these files wouldn't exist
    expect(existsSync(join(testOutDir, 'figma.png'))).toBe(true);
    expect(existsSync(join(testOutDir, 'impl.png'))).toBe(true);
    expect(existsSync(join(testOutDir, 'diff.png'))).toBe(true);
  });
});
