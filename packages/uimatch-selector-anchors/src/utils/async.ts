/**
 * Async utility functions
 *
 * @module utils/async
 */

/**
 * Execute a promise with timeout protection
 * Returns null if the timeout is reached
 *
 * @param promise - Promise to execute with timeout
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise result or null on timeout
 *
 * @example
 * ```typescript
 * const result = await withTimeout(heavyOperation(), 5000);
 * if (result === null) {
 *   console.log('Operation timed out');
 * }
 * ```
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return await Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}
