import { UiMatchError } from '@uimatch/core';
import { errln } from './print.js';

/**
 * Report a failed command and translate it into the documented exit code.
 *
 * - `2` when the invocation itself must change (arguments, configuration, or
 *   required environment variables)
 * - `1` for every other failure, including untyped errors
 *
 * @param label - Prefix identifying the command (for example `❌ Error`)
 * @param error - Value thrown by the command
 * @returns Exit code to return from the command
 */
export function reportCommandError(label: string, error: unknown): number {
  if (error instanceof UiMatchError) {
    errln(`${label} [${error.code}]:`, error.message);
    return error.category === 'usage' ? 2 : 1;
  }

  errln(`${label}:`, error instanceof Error ? error.message : String(error));
  return 1;
}
