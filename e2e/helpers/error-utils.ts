/**
 * Utility functions for safe error handling in E2E tests
 *
 * This module provides type-safe error message extraction to gradually
 * restore stricter ESLint rules (no-unsafe-*) that were temporarily relaxed.
 *
 * Usage:
 * ```ts
 * import { extractErrorMessage } from './helpers/error-utils';
 *
 * try {
 *   await someOperation();
 * } catch (e) {
 *   const msg = extractErrorMessage(e);
 *   console.error('Operation failed:', msg);
 * }
 * ```
 */

/**
 * Safely extract error message from unknown error value
 *
 * @param err - The caught error value (unknown type)
 * @returns Error message string or stringified representation
 *
 * @example
 * ```ts
 * try {
 *   throw new Error('Something went wrong');
 * } catch (e) {
 *   const msg = extractErrorMessage(e); // "Something went wrong"
 * }
 * ```
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  // Handle error-like objects with message property
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof err.message === 'string'
  ) {
    return err.message;
  }

  // Fallback to string representation
  return String(err);
}

/**
 * Extract error stack trace safely
 *
 * @param err - The caught error value (unknown type)
 * @returns Stack trace string or undefined if not available
 *
 * @example
 * ```ts
 * try {
 *   throw new Error('Something went wrong');
 * } catch (e) {
 *   const stack = extractErrorStack(e);
 *   if (stack) {
 *     console.error('Stack trace:', stack);
 *   }
 * }
 * ```
 */
export function extractErrorStack(err: unknown): string | undefined {
  if (err instanceof Error) {
    return err.stack;
  }

  // Handle error-like objects with stack property
  if (
    typeof err === 'object' &&
    err !== null &&
    'stack' in err &&
    typeof err.stack === 'string'
  ) {
    return err.stack;
  }

  return undefined;
}

/**
 * Create formatted error details object
 *
 * @param err - The caught error value (unknown type)
 * @returns Object with message, stack, and type information
 *
 * @example
 * ```ts
 * try {
 *   await fetchData();
 * } catch (e) {
 *   const details = formatErrorDetails(e);
 *   console.error('Error details:', JSON.stringify(details, null, 2));
 * }
 * ```
 */
export function formatErrorDetails(err: unknown): {
  message: string;
  stack?: string;
  type: string;
  raw?: unknown;
} {
  return {
    message: extractErrorMessage(err),
    stack: extractErrorStack(err),
    type: err instanceof Error ? err.constructor.name : typeof err,
    raw: process.env.NODE_ENV === 'development' ? err : undefined,
  };
}
