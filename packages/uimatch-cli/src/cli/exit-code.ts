import { UiMatchError } from '@uimatch/core';
import { errln } from './print.js';

/**
 * Report a failed command and translate it into the documented exit code:
 * `2` when the invocation itself must change, `1` for everything else.
 */
export function reportCommandError(label: string, error: unknown): number {
  if (error instanceof UiMatchError) {
    errln(`${label} [${error.code}]:`, error.message);
    return error.category === 'usage' ? 2 : 1;
  }

  errln(`${label}:`, error instanceof Error ? error.message : String(error));
  return 1;
}
