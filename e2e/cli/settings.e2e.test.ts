import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../packages/uimatch-core/src/config/schema';

// Path to CLI for process-based execution
const CLI_PATH = join(import.meta.dir, '../../packages/uimatch-cli/src/cli/index.ts');

describe('E2E: settings command', () => {
  const testDir = join(import.meta.dir, 'fixtures', 'settings-test');
  const configPath = join(testDir, '.uimatchrc.json');

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
    const output = execSync(`bun ${CLI_PATH} settings get`, {
      cwd: testDir,
      encoding: 'utf-8',
    });

    // Should output valid JSON
    const config = JSON.parse(output) as AppConfig;

    // Verify expected structure
    expect(config).toHaveProperty('comparison');
    expect(config).toHaveProperty('capture');
    expect(config.comparison).toHaveProperty('pixelmatchThreshold');
    expect(config.comparison).toHaveProperty('acceptancePixelDiffRatio');
  });

  test('settings get (implicit): same as explicit get', () => {
    const explicitOutput = execSync(`bun ${CLI_PATH} settings get`, {
      cwd: testDir,
      encoding: 'utf-8',
    });

    const implicitOutput = execSync(`bun ${CLI_PATH} settings`, {
      cwd: testDir,
      encoding: 'utf-8',
    });

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

    const output = execSync(`bun ${CLI_PATH} settings get`, {
      cwd: testDir,
      encoding: 'utf-8',
    });

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
    const output = execSync(`bun ${CLI_PATH} settings reset`, {
      cwd: testDir,
      encoding: 'utf-8',
    });

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

    const output = execSync(`bun ${CLI_PATH} settings reset`, {
      cwd: testDir,
      encoding: 'utf-8',
    });

    expect(output).toContain('Settings reset to defaults:');
    expect(existsSync(configPath)).toBe(false);
  });

  test('settings <unknown>: exits with error code 2 and shows usage', () => {
    expect(() => {
      execSync(`bun ${CLI_PATH} settings unknown-action`, {
        cwd: testDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();

    try {
      execSync(`bun ${CLI_PATH} settings unknown-action`, {
        cwd: testDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (error: unknown) {
      const execError = error as { status?: number; stderr?: Buffer };
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

    const output = execSync(`bun ${CLI_PATH} settings get`, {
      cwd: testDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Should fall back to defaults and output valid JSON
    const config = JSON.parse(output) as AppConfig;
    expect(config).toHaveProperty('comparison');
    expect(config).toHaveProperty('capture');
  });
});
