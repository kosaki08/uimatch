#!/usr/bin/env node
/**
 * uiMatch CLI entry point
 */

import { runCompare } from './compare.js';
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
    console.log(
      'Run "uimatch compare" or "uimatch suite" without args to see command-specific options'
    );
    process.exit(0);
  }

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
