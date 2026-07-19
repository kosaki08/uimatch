/**
 * Experimental Claude-specific report command.
 *
 * @experimental
 * This command may change or be removed without notice.
 */

import { runCompare } from '#plugin/cli/compare.js';
import { errln } from '#plugin/cli/print.js';

/**
 * Run the legacy experimental wrapper and preserve the compare exit code.
 */
export async function runExperimentalClaudeReport(args: string[]): Promise<number> {
  // Check for format option
  const formatArg = args.find((arg) => arg.startsWith('--format='));
  const format = formatArg?.split('=')[1] ?? 'prompt';

  if (format !== 'prompt' && format !== 'json') {
    errln(`Invalid format: ${format}. Use --format=prompt or --format=json`);
    return 2;
  }

  // Filter out experimental flags before passing to runCompare
  const compareArgs = args.filter(
    (arg) => !arg.startsWith('--format=') && !arg.startsWith('--experimental-')
  );

  const exitCode = await runCompare(compareArgs);
  if (exitCode !== 0) {
    return exitCode;
  }

  errln('\nExperimental Claude Report:');
  errln(`The ${format} formatter is not implemented; use the standard compare output above.`);
  return 0;
}
