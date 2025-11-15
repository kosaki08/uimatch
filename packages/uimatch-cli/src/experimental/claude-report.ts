/**
 * Experimental Claude-specific report command.
 *
 * @experimental
 * This command may change or be removed without notice.
 */

import { runCompare } from '#plugin/cli/compare.js';
import { errln, outln } from '#plugin/cli/print.js';
import type { CompareResult } from '#plugin/types/index.js';
import { formatForLLM, generateLLMPrompt } from './claude-formatter.js';

/**
 * Run compare and output Claude-optimized report format.
 */
export async function runExperimentalClaudeReport(args: string[]): Promise<void> {
  // Check for format option
  const formatArg = args.find((arg) => arg.startsWith('--format='));
  const format = formatArg?.split('=')[1] ?? 'prompt';

  if (format !== 'prompt' && format !== 'json') {
    errln(`Invalid format: ${format}. Use --format=prompt or --format=json`);
    process.exit(2);
  }

  // Filter out experimental flags before passing to runCompare
  const compareArgs = args.filter(
    (arg) => !arg.startsWith('--format=') && !arg.startsWith('--experimental-')
  );

  // Run standard compare but capture result
  let result: CompareResult | undefined;

  // Temporarily override process.exit to suppress early exits from runCompare
  const originalExit: (this: void, code?: number) => never = process.exit.bind(process);
  (process.exit as unknown) = ((code?: number): never => {
    if (code !== 0 && code !== undefined) {
      originalExit(code);
    }
    // Allow continuing if exit code is 0 or undefined
    return undefined as never;
  }) as typeof process.exit;

  try {
    // Run compare - this will log comparison details normally
    await runCompare(compareArgs);

    // For now, we need to re-run comparison to get result
    // This is a PoC limitation - in future, runCompare should return result
    errln('\nExperimental Claude Report:');
    errln('Note: Full Claude integration requires runCompare to return CompareResult');
    errln('For now, use the standard compare output above.');
  } finally {
    // Restore original process.exit
    process.exit = originalExit;
  }

  // Generate Claude-optimized output
  if (result) {
    const payload = formatForLLM(result, { preferTokens: true });

    if (format === 'json') {
      outln(JSON.stringify(payload, null, 2));
    } else {
      outln(generateLLMPrompt(payload));
    }
  }
}
