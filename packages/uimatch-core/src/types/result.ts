/**
 * Result type for explicit error handling
 * Uses discriminated unions for type-safe success/failure handling
 */

/**
 * Success result
 */
export interface Success<T> {
  success: true;
  value: T;
}

/**
 * Failure result with error information
 */
export interface Failure<E> {
  success: false;
  error: E;
}

/**
 * Result type that can be either Success or Failure
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return { success: false, error: 'Division by zero' };
 *   }
 *   return { success: true, value: a / b };
 * }
 * ```
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Create a success result
 */
export function ok<T>(value: T): Success<T> {
  return { success: true, value };
}

/**
 * Create a failure result
 */
export function err<E>(error: E): Failure<E> {
  return { success: false, error };
}

/**
 * Check if result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is Success<T> {
  return result.success;
}

/**
 * Check if result is a failure
 */
export function isErr<T, E>(result: Result<T, E>): result is Failure<E> {
  return !result.success;
}

/**
 * Unwrap a result or throw an error
 * @throws If result is a failure
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.success) {
    return result.value;
  }
  // Ensure we throw an Error instance
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
}

/**
 * Unwrap a result or return a default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.success) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Map a successful result to a new value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.success) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map an error to a new error
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.success) {
    return err(fn(result.error));
  }
  return result;
}
