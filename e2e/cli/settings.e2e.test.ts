import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AppConfig } from '../../packages/uimatch-core/src/config/schema';
import { cliProcessArgs } from '../../test-utils/run-cli.js';

describe('E2E: settings command', () => {
  const testDir = join(import.meta.dirname, 'fixtures', 'settings-test');
  const configPath = join(testDir, '.uimatchrc.json');

  function runSettings(args: readonly string[]): string {
    return execFileSync(process.execPath, cliProcessArgs(['settings', ...args]), {
      cwd: testDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }

  beforeEach(async () => {
    // Clean test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    await rm(testDir, { recursive: true, force: true });
  });

  test('settings get: outputs default config as JSON when no config file exists', () => {
    const output = runSettings(['get']);

    // Should output valid JSON
    const config = JSON.parse(output) as AppConfig;

    // Verify expected structure
    expect(config).toHaveProperty('comparison');
    expect(config).toHaveProperty('capture');
    expect(config.comparison).toHaveProperty('pixelmatchThreshold');
    expect(config.comparison).toHaveProperty('acceptancePixelDiffRatio');
  });

  test('settings get (implicit): same as explicit get', () => {
    const explicitOutput = runSettings(['get']);
    const implicitOutput = runSettings([]);

    // Both should produce identical JSON output
    expect(JSON.parse(implicitOutput)).toEqual(JSON.parse(explicitOutput));
  });

  test('settings get: reads from .uimatchrc.json if exists', async () => {
    // Create partial custom config (mergeConfig will apply defaults for missing fields)
    const customConfig = {
      comparison: {
        pixelmatchThreshold: 0.2,
        acceptancePixelDiffRatio: 0.05,
      },
    };

    await writeFile(configPath, JSON.stringify(customConfig, null, 2));

    const output = runSettings(['get']);

    const config = JSON.parse(output) as AppConfig;

    // Should reflect custom values
    expect(config.comparison.pixelmatchThreshold).toBe(0.2);
    expect(config.comparison.acceptancePixelDiffRatio).toBe(0.05);

    // Should have defaults merged for unspecified fields
    expect(config.comparison).toHaveProperty('acceptanceColorDeltaE');
    expect(config.capture).toHaveProperty('defaultViewportWidth');
  });

  test('settings reset: deletes config file and outputs defaults', async () => {
    // Create custom config first
    const customConfig = {
      comparison: {
        pixelmatchThreshold: 0.9,
        acceptancePixelDiffRatio: 0.1,
        acceptanceColorDeltaE: 10.0,
        includeAA: false,
      },
    };

    await writeFile(configPath, JSON.stringify(customConfig, null, 2));
    expect(existsSync(configPath)).toBe(true);

    // Reset
    const output = runSettings(['reset']);

    // Should output reset message
    expect(output).toContain('Settings reset to defaults:');

    // Should output valid JSON (after the message)
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();
    if (!jsonMatch) throw new Error('No JSON found in output');

    const config = JSON.parse(jsonMatch[0]) as AppConfig;
    expect(config).toHaveProperty('comparison');
    expect(config).toHaveProperty('capture');

    // Config file should be deleted
    expect(existsSync(configPath)).toBe(false);
  });

  test('settings reset: succeeds even when no config file exists', () => {
    expect(existsSync(configPath)).toBe(false);

    const output = runSettings(['reset']);

    expect(output).toContain('Settings reset to defaults:');
    expect(existsSync(configPath)).toBe(false);
  });

  test('settings <unknown>: exits with error code 2 and shows usage', () => {
    expect(() => {
      runSettings(['unknown-action']);
    }).toThrow();

    try {
      runSettings(['unknown-action']);
    } catch (error: unknown) {
      const execError = error as { status?: number; stderr?: Buffer | string };
      expect(execError.status).toBe(2);

      const stderr = execError.stderr?.toString() ?? '';
      expect(stderr).toContain('Unknown settings action');
      expect(stderr).toContain('Available actions:');
      expect(stderr).toContain('get');
      expect(stderr).toContain('reset');
      expect(stderr).toContain('Examples:');
      expect(stderr).toContain('uimatch settings');
    }
  });

  test('settings get: handles malformed .uimatchrc.json gracefully', async () => {
    // Write invalid JSON
    await writeFile(configPath, '{ invalid json }');

    const output = runSettings(['get']);

    // Should fall back to defaults and output valid JSON
    const config = JSON.parse(output) as AppConfig;
    expect(config).toHaveProperty('comparison');
    expect(config).toHaveProperty('capture');
  });
});
