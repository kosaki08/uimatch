/**
 * Text comparison command
 */

import { compareText } from '@uimatch/core';
import { errln, outln } from './print.js';

/**
 * Print text-diff command help message
 */
function printTextDiffHelp(): void {
  outln('uiMatch text-diff - Compare two text strings and show similarity');
  outln('');
  outln('Usage: uimatch text-diff <expected> <actual> [options]');
  outln('');
  outln('Arguments:');
  outln('  <expected>              Expected text string');
  outln('  <actual>                Actual text string');
  outln('');
  outln('Options:');
  outln('  --case-sensitive        Enable case-sensitive comparison (default: false)');
  outln('  --threshold=<number>    Similarity threshold for match (0-1, default: 0.9)');
  outln('');
  outln('Output:');
  outln('  Returns JSON with comparison result:');
  outln('  - kind: "exact-match" | "whitespace-or-case-only" | "normalized-match" | "mismatch"');
  outln('  - similarity: Similarity score (0-1)');
  outln('  - normalizedExpected: Normalized expected text');
  outln('  - normalizedActual: Normalized actual text');
  outln('');
  outln('Examples:');
  outln('  uimatch text-diff "Sign in" "Sign  in"');
  outln('  uimatch text-diff "Submit" "submit" --case-sensitive');
  outln('  uimatch text-diff "Hello" "Helo" --threshold=0.6');
}

/**
 * Run text-diff command
 */
export function runTextDiff(args: string[]): void {
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    printTextDiffHelp();
    process.exit(0);
  }

  // Parse positional arguments
  const positional: string[] = [];
  const flags: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--')) {
      flags.push(arg);
    } else {
      positional.push(arg);
    }
  }

  // Validate required arguments
  if (positional.length < 2) {
    errln('Error: Missing required arguments');
    errln('');
    printTextDiffHelp();
    process.exit(2);
  }

  // Safe to access after length check
  const expected = positional[0] as string;
  const actual = positional[1] as string;

  // Parse options
  let caseSensitive = false;
  let similarityThreshold: number | undefined;

  for (const flag of flags) {
    if (flag === '--case-sensitive') {
      caseSensitive = true;
    } else if (flag.startsWith('--threshold=')) {
      const [, value] = flag.split('=');
      const parsed = Number(value);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
        errln(`Error: Invalid threshold value: ${value}`);
        errln('Threshold must be a number between 0 and 1');
        process.exit(2);
      }
      similarityThreshold = parsed;
    } else {
      errln(`Error: Unknown option: ${flag}`);
      errln('');
      printTextDiffHelp();
      process.exit(2);
    }
  }

  // Run comparison
  const result = compareText(expected, actual, {
    caseSensitive,
    similarityThreshold,
  });

  // Output JSON result
  outln(JSON.stringify(result, null, 2));
}
