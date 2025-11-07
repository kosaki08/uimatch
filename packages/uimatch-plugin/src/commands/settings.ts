/**
 * Settings management command
 */

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from 'uimatch-core';
import { outln } from '../cli/print.js';

/**
 * Configuration file path
 * TODO: Consider searching parent directories for .uimatchrc.json
 * to support monorepo setups where config may be in workspace root
 */
const CONFIG_FILE = '.uimatchrc.json';

/**
 * Get current configuration
 *
 * Reads from .uimatchrc.json if it exists, otherwise returns defaults.
 * This ensures that settings written via updateSettings() are properly loaded.
 */
export function getSettings(): AppConfig {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<AppConfig>;
      return mergeConfig(parsed); // Apply defaults and validation
    } catch {
      process.stderr.write('⚠️  Failed to parse .uimatchrc.json, using defaults' + '\n');
    }
  }
  return DEFAULT_CONFIG;
}

/**
 * Update settings with partial configuration
 *
 * @param updates - Partial configuration to merge with existing settings
 * @returns Updated configuration
 *
 * @example
 * ```typescript
 * const config = updateSettings({
 *   comparison: {
 *     colorDeltaEThreshold: 2.0
 *   }
 * });
 * ```
 */
export function updateSettings(updates: Partial<AppConfig>): AppConfig {
  const configPath = path.join(process.cwd(), CONFIG_FILE);

  // Load existing config
  let existing: AppConfig | null = null;
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<AppConfig>;
      // Merge existing with defaults to get full config
      existing = mergeConfig(parsed);
    } catch {
      process.stderr.write(`⚠️  Failed to parse existing config, using defaults` + '\n');
    }
  }

  // Deep merge existing and updates
  const base = existing ?? DEFAULT_CONFIG;
  const mergedPartial: Partial<AppConfig> = {
    capture: {
      ...base.capture,
      ...updates.capture,
    },
    comparison: {
      ...base.comparison,
      ...updates.comparison,
    },
  };

  // Validate
  const merged = mergeConfig(mergedPartial);

  // Save to file
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');

  return merged;
}

/**
 * Reset settings to defaults
 *
 * @returns Default configuration
 */
export function resetSettings(): AppConfig {
  const configPath = path.join(process.cwd(), CONFIG_FILE);

  // Delete existing config file if it exists
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  return DEFAULT_CONFIG;
}

/**
 * Display current settings in a user-friendly format
 *
 * @param config - Configuration to display
 */
export function displaySettings(config: AppConfig): void {
  process.stdout.write('\nCurrent uiMatch Configuration:');
  process.stdout.write('─'.repeat(50) + '\n');

  // Comparison settings
  process.stdout.write('\n📊 Comparison Settings:');
  outln(
    `  Pixelmatch threshold: ${config.comparison.pixelmatchThreshold.toFixed(2)} (0-1, lower = more sensitive)`
  );
  process.stdout.write(`  Include anti-aliasing: ${config.comparison.includeAA}` + '\n');
  process.stdout.write(
    `  Color delta E threshold: ${config.comparison.colorDeltaEThreshold.toFixed(1)} ΔE` + '\n'
  );
  outln(
    `  Acceptance pixel diff ratio: ${(config.comparison.acceptancePixelDiffRatio * 100).toFixed(2)}%`
  );
  outln(`  Acceptance color delta E: ${config.comparison.acceptanceColorDeltaE.toFixed(1)} ΔE`);

  // Capture settings
  process.stdout.write('\n🖥️  Capture Settings:');
  outln(
    `  Default viewport: ${config.capture.defaultViewportWidth}x${config.capture.defaultViewportHeight}`
  );
  process.stdout.write(`  Default DPR: ${config.capture.defaultDpr}` + '\n');
  process.stdout.write(`  Default Figma scale: ${config.capture.defaultFigmaScale}` + '\n');
  process.stdout.write(`  Auto ROI: ${config.capture.figmaAutoRoi}` + '\n');
  process.stdout.write(`  Idle wait: ${config.capture.defaultIdleWaitMs}ms` + '\n');
  process.stdout.write(`  Max children to analyze: ${config.capture.defaultMaxChildren}` + '\n');

  // Basic Auth
  if (config.capture.basicAuthUser || config.capture.basicAuthPass) {
    process.stdout.write('\n🔐 Basic Authentication:');
    outln(
      `  Username: ${config.capture.basicAuthUser ? config.capture.basicAuthUser : '(not set)'}`
    );
    process.stdout.write(
      `  Password: ${config.capture.basicAuthPass ? '***' : '(not set)'}` + '\n'
    );
  }

  process.stdout.write('\n' + '─'.repeat(50));
  process.stdout.write(`\n💡 Config file: ${path.join(process.cwd(), CONFIG_FILE)}`);
}

/**
 * Main settings command handler
 *
 * @param action - Action to perform (get, set, reset)
 * @param updates - Updates to apply (for 'set' action)
 * @returns Configuration
 */
export function uiMatchSettings(
  action: 'get' | 'set' | 'reset' = 'get',
  updates?: Partial<AppConfig>
): AppConfig {
  switch (action) {
    case 'get': {
      const config = getSettings();
      displaySettings(config);
      return config;
    }

    case 'set': {
      if (!updates) {
        throw new Error('Updates required for set action');
      }
      const config = updateSettings(updates);
      process.stdout.write('\n✅ Settings updated successfully\n');
      displaySettings(config);
      return config;
    }

    case 'reset': {
      const config = resetSettings();
      process.stdout.write('\n✅ Settings reset to defaults\n');
      displaySettings(config);
      return config;
    }

    default:
      throw new Error(`Unknown action: ${action as string}`);
  }
}
