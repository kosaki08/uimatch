/**
 * uiMatch CLI entry point
 */

// P0 Guard: Top-level exception handlers to prevent silent crashes
process.on('uncaughtException', (error: Error) => {
  process.stderr.write(`Fatal error (uncaught exception): ${error?.message ?? error}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const error = reason as Error | undefined;
  process.stderr.write(`Fatal error (unhandled promise rejection): ${error?.message ?? reason}\n`);
  process.exit(1);
});

import { uiMatchSettings } from '#plugin/commands/settings.js';
import { runCompare } from './compare.js';
import { runDoctor } from './doctor/index.js';
import { initLogger } from './logger.js';
import { runSuite } from './suite.js';

const command = process.argv[2];
const args = process.argv.slice(3);

/**
 * Print help message to stdout (bypassing logger for CLI output)
 */
function printHelp(): void {
  const help = [
    'uiMatch CLI - Visual comparison tool for Figma designs and web implementations',
    '',
    'Usage: uimatch <command> [options]',
    '',
    'Commands:',
    '  compare    Compare Figma design with web implementation',
    '  suite      Run multiple compares from a JSON suite file',
    '  doctor     Check environment and configuration',
    '  settings   Manage plugin configuration (get|set|reset)',
    '  help       Show this help message',
    '',
    'Global Options:',
    '  --log-level <level>     Set log level (silent|debug|info|warn|error)',
    '  --log-format <format>   Set log format (json|pretty|silent)',
    '  --log-file <path>       Write logs to file',
    '',
    'Run "uimatch compare" or "uimatch suite" without args to see command-specific options',
  ].join('\n');
  process.stdout.write(help + '\n');
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
    console.error(`Unknown command: ${command}`);
    console.error('Run "uimatch help" to see available commands');
    process.exit(2);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
