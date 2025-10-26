#!/usr/bin/env bun
/**
 * CLI wrapper for uiMatch settings command
 * Usage: bun run uimatch:settings -- <get|set|reset> [key=value]
 */

import { getSettings, resetSettings, updateSettings } from 'uimatch-plugin';

function parseArgs(argv: string[]): {
  action: string;
  updates: Record<string, unknown>;
} {
  const [action, ...rest] = argv;
  const updates: Record<string, unknown> = {};

  for (const arg of rest) {
    const match = arg.match(/^([\w.]+)=([\s\S]+)$/);
    if (match) {
      const key = match[1];
      const value = match[2];

      // Parse numbers and booleans
      if (value === 'true') {
        setNestedValue(updates, key, true);
      } else if (value === 'false') {
        setNestedValue(updates, key, false);
      } else if (!isNaN(parseFloat(value))) {
        setNestedValue(updates, key, parseFloat(value));
      } else {
        setNestedValue(updates, key, value);
      }
    }
  }

  return { action: action || 'get', updates };
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
}

async function main() {
  const { action, updates } = parseArgs(process.argv.slice(2));

  try {
    switch (action) {
      case 'get': {
        const settings = getSettings();
        console.log('Current settings:');
        console.log(JSON.stringify(settings, null, 2));
        break;
      }

      case 'set': {
        if (Object.keys(updates).length === 0) {
          console.error('Usage: bun run uimatch:settings -- set key=value [key2=value2...]');
          console.error('');
          console.error('Example:');
          console.error(
            '  bun run uimatch:settings -- set comparison.acceptancePixelDiffRatio=0.03'
          );
          process.exit(2);
        }

        const newSettings = updateSettings(updates);
        console.log('Settings updated:');
        console.log(JSON.stringify(newSettings, null, 2));
        break;
      }

      case 'reset': {
        const defaultSettings = resetSettings();
        console.log('Settings reset to defaults:');
        console.log(JSON.stringify(defaultSettings, null, 2));
        break;
      }

      default:
        console.error('Usage: bun run uimatch:settings -- <get|set|reset> [key=value]');
        console.error('');
        console.error('Actions:');
        console.error('  get              Display current settings');
        console.error('  set key=value    Update specific setting');
        console.error('  reset            Reset to default settings');
        console.error('');
        console.error('Examples:');
        console.error('  bun run uimatch:settings -- get');
        console.error('  bun run uimatch:settings -- set comparison.acceptancePixelDiffRatio=0.03');
        console.error('  bun run uimatch:settings -- reset');
        process.exit(2);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
