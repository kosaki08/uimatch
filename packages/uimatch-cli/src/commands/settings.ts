/**
 * Settings management command
 */

import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from '@uimatch/core';
import fs from 'node:fs';
import path from 'node:path';

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
