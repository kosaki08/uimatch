/**
 * Async utility functions
 *
 * @module utils/async
 */

const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Execute a promise with timeout protection
 * Returns null if the timeout is reached
 *
 * @param promise - Promise to execute with timeout
 * @param timeoutMs - Timeout in milliseconds. Values outside Node's timer range time out immediately.
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
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    void promise.catch(() => {});
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
