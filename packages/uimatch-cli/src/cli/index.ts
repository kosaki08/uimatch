/**
 * uiMatch CLI entry point
 */

import { getSettings, resetSettings } from '#plugin/commands/settings.js';
import { runExperimentalClaudeReport } from '#plugin/experimental/claude-report.js';
import { createRequire } from 'module';
import { runCompare } from './compare.js';
import { runDoctor } from './doctor/index.js';
import { initLogger } from './logger.js';
import { errln, outln } from './print.js';
import { runSuite } from './suite.js';
import { runTextDiff } from './text-diff.js';

interface PackageJson {
  version: string;
}

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as PackageJson;

// P0 Guard: Exception handlers to catch runtime errors
// Note: Module loading errors cannot be caught here per ESM specification
process.on('uncaughtException', (error: Error) => {
  process.stderr.write(`Fatal error (uncaught exception): ${error?.message ?? String(error)}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const error = reason as Error | undefined;
  process.stderr.write(
    `Fatal error (unhandled promise rejection): ${error?.message ?? String(reason)}\n`
  );
  process.exit(1);
});

const command = process.argv[2];
const args = process.argv.slice(3);

/**
 * Print help message to stdout (bypassing logger for CLI output)
 */
function printHelp(): void {
  outln('uiMatch CLI - Visual comparison tool for Figma designs and web implementations');
  outln('');
  outln('Usage: uimatch <command> [options]');
  outln('');
  outln('Commands:');
  outln('  compare       Compare Figma design with web implementation');
  outln('  suite         Run multiple compares from a JSON suite file');
  outln('  text-diff     Compare two text strings and show similarity');
  outln('  doctor        Check environment and configuration');
  outln('  settings      Manage plugin configuration (get|set|reset)');
  outln('  experimental  Experimental commands (unstable, may change)');
  outln('  help          Show this help message');
  outln('  version       Show version number');
  outln('');
  outln('Global Options:');
  outln('  --log-level <level>     Set log level (silent|debug|info|warn|error)');
  outln('  --log-format <format>   Set log format (json|pretty|silent)');
  outln('  --log-file <path>       Write logs to file');
  outln('');
  outln('Run "uimatch compare" or "uimatch suite" without args to see command-specific options');
}

/**
 * Print version message to stdout (bypassing logger for CLI output)
 */
function printVersion(): void {
  outln(`uimatch-cli: ${pkg.version}`);
}

async function main(): Promise<void> {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    printVersion();
    process.exit(0);
  }

  // Initialize logger before running commands
  initLogger(args);

  if (command === 'experimental') {
    const subcommand = args[0];
    if (!subcommand) {
      errln('⚠️  Experimental commands are unstable and may change or be removed.');
      errln('');
      errln('Available experimental commands:');
      errln('  claude-report  - Generate Claude-optimized comparison report');
      errln('');
      errln('Example:');
      errln('  uimatch experimental claude-report --figma current --url http://localhost:3000');
      process.exit(2);
    }

    if (subcommand === 'claude-report') {
      await runExperimentalClaudeReport(args.slice(1));
    } else {
      errln(`Unknown experimental command: ${subcommand}`);
      errln('Run "uimatch experimental" to see available commands');
      process.exit(2);
    }
  } else if (command === 'compare') {
    await runCompare(args);
  } else if (command === 'suite') {
    await runSuite(args);
  } else if (command === 'text-diff') {
    runTextDiff(args);
  } else if (command === 'doctor') {
    await runDoctor(args);
  } else if (command === 'settings') {
    // Parse settings action from args
    const action = args[0] || 'get';
    if (action === 'get') {
      const config = getSettings();
      outln(JSON.stringify(config, null, 2));
    } else if (action === 'reset') {
      const config = resetSettings();
      outln('Settings reset to defaults:');
      outln(JSON.stringify(config, null, 2));
    } else {
      errln(`Unknown settings action: ${action}`);
      errln('');
      errln('Available actions:');
      errln('  get    - View current settings (default)');
      errln('  reset  - Reset settings to defaults');
      errln('');
      errln('Examples:');
      errln('  uimatch settings');
      errln('  uimatch settings get');
      errln('  uimatch settings reset');
      process.exit(2);
    }
  } else {
    errln(`Unknown command: ${command}`);
    errln('Run "uimatch help" to see available commands');
    process.exit(2);
  }
}

main().catch((error) => {
  errln('Fatal error:', error);
  process.exit(1);
});
