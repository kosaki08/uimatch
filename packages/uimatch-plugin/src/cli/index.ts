/**
 * uiMatch CLI entry point
 */

// P0 Guard: Top-level exception handlers to prevent silent crashes
process.on('uncaughtException', (error: Error) => {
  console.error('Fatal error (uncaught exception):', error?.message ?? error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const error = reason as Error | undefined;
  console.error('Fatal error (unhandled promise rejection):', error?.message ?? reason);
  process.exit(1);
});

import { runCompare } from './compare.js';
import { initLogger } from './logger.js';
import { runSuite } from './suite.js';

const command = process.argv[2];
const args = process.argv.slice(3);

async function main(): Promise<void> {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log('uiMatch CLI - Visual comparison tool for Figma designs and web implementations');
    console.log('');
    console.log('Usage: uimatch <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  compare    Compare Figma design with web implementation');
    console.log('  suite      Run multiple compares from a JSON suite file');
    console.log('  help       Show this help message');
    console.log('');
    console.log('Global Options:');
    console.log('  --log-level <level>     Set log level (silent|debug|info|warn|error)');
    console.log('  --log-format <format>   Set log format (json|pretty|silent)');
    console.log('  --log-file <path>       Write logs to file');
    console.log('');
    console.log(
      'Run "uimatch compare" or "uimatch suite" without args to see command-specific options'
    );
    process.exit(0);
  }

  // Initialize logger before running commands
  initLogger(args);

  if (command === 'compare') {
    await runCompare(args);
  } else if (command === 'suite') {
    await runSuite(args);
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
