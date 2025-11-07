/**
 * Error handling utilities
 */

/**
 * Extract error message from unknown error type
 *
 * @param err - Unknown error object
 * @returns Error message string
 *
 * @example
 * try {
 *   // risky operation
 * } catch (err) {
 *   console.error(`Failed: ${extractErrorMessage(err)}`);
 * }
 */
export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
