/**
 * uiMatch CLI entry point
 */

import { uiMatchSettings } from '#plugin/commands/settings.js';
import { runCompare } from './compare.js';
import { runDoctor } from './doctor/index.js';
import { initLogger } from './logger.js';
import { errln, outln } from './print.js';
import { runSuite } from './suite.js';

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
  outln('  compare    Compare Figma design with web implementation');
  outln('  suite      Run multiple compares from a JSON suite file');
  outln('  doctor     Check environment and configuration');
  outln('  settings   Manage plugin configuration (get|set|reset)');
  outln('  help       Show this help message');
  outln('');
  outln('Global Options:');
  outln('  --log-level <level>     Set log level (silent|debug|info|warn|error)');
  outln('  --log-format <format>   Set log format (json|pretty|silent)');
  outln('  --log-file <path>       Write logs to file');
  outln('');
  outln('Run "uimatch compare" or "uimatch suite" without args to see command-specific options');
}

async function main(): Promise<void> {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  // Initialize logger before running commands
  initLogger(args);

  if (command === 'compare') {
    await runCompare(args);
  } else if (command === 'suite') {
    await runSuite(args);
  } else if (command === 'doctor') {
    await runDoctor(args);
  } else if (command === 'settings') {
    // Parse settings action from args
    const action = (args[0] as 'get' | 'set' | 'reset') || 'get';
    uiMatchSettings(action);
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
