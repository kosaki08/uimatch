/**
 * Safe regex compilation utility with ReDoS protection
 *
 * @module safe-regex
 */

import safe from 'safe-regex2';
import { extractErrorMessage } from './error.js';
import type { RE2Constructor } from './re2.types.js';
import { extractRE2Constructor } from './re2.types.js';

/**
 * Maximum allowed regex pattern length to prevent extremely long patterns
 * Increased to 500 to accommodate large HTML fragments without performance impact
 */
const MAX_PATTERN_LENGTH = 500;

/**
 * Maximum input length for regex execution to prevent excessive processing time
 */
const MAX_INPUT_LENGTH = 10_000;

/**
 * Create a memoized optional RE2 loader.
 * Concurrent callers share the same import attempt and resolved constructor.
 */
export function createRE2Loader(
  importer: () => Promise<unknown>
): () => Promise<RE2Constructor | null> {
  let loadPromise: Promise<RE2Constructor | null> | undefined;

  return () => {
    loadPromise ??= importer()
      .then(extractRE2Constructor)
      .catch(() => null);
    return loadPromise;
  };
}

const loadRE2 = createRE2Loader(async () => {
  // Type assertion is required because re2 is an optional dependency and may
  // be absent from the installation used for type-checking.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const re2Module: unknown = await import('re2' as never);
  return re2Module;
});

export function getRegexInputLengthError(input: string): string | undefined {
  return input.length > MAX_INPUT_LENGTH
    ? `regex input length ${input.length} exceeds maximum ${MAX_INPUT_LENGTH}`
    : undefined;
}

/**
 * Result of safe regex compilation
 */
export type SafeRegexResult =
  | { success: true; regex: RegExp }
  | { success: false; error: string; fallbackToLiteral: true };

/**
 * Compile a regex pattern with safety validation
 *
 * Protects against:
 * - Excessively long patterns (>500 chars)
 * - Potential ReDoS vulnerabilities (checked by safe-regex2)
 * - Invalid regex syntax
 *
 * Uses RE2 engine if available for guaranteed linear-time execution.
 * Falls back to standard RegExp with safe-regex2 pre-validation.
 *
 * @param pattern - The regex pattern string
 * @param flags - Optional regex flags (e.g., 'i', 'g')
 * @returns SafeRegexResult with compiled regex or error details
 *
 * @example
 * ```ts
 * const result = compileSafeRegex('hello.*world', 'i');
 * if (result.success) {
 *   const matches = result.regex.test('Hello World');
 * } else {
 *   // Fallback to literal string matching
 *   console.warn('Regex compilation failed:', result.error);
 * }
 * ```
 */
export async function compileSafeRegex(pattern: string, flags?: string): Promise<SafeRegexResult> {
  // Check pattern length
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      success: false,
      error: `Regex pattern too long (${pattern.length} > ${MAX_PATTERN_LENGTH})`,
      fallbackToLiteral: true,
    };
  }

  // Validate with safe-regex2 for catastrophic backtracking detection
  if (!safe(pattern)) {
    return {
      success: false,
      error: 'Potentially dangerous regex pattern detected (catastrophic backtracking risk)',
      fallbackToLiteral: true,
    };
  }

  // Try to load RE2 if not already attempted
  const RE2 = await loadRE2();

  // Try to compile with RE2 if available (linear-time guarantee)
  if (RE2) {
    try {
      const regex = new RE2(pattern, flags);

      return { success: true, regex };
    } catch (err) {
      return {
        success: false,
        error: `RE2 compilation failed: ${extractErrorMessage(err)}`,
        fallbackToLiteral: true,
      };
    }
  }

  // Fallback to standard RegExp (already validated by safe-regex2)
  try {
    const regex = new RegExp(pattern, flags);
    return { success: true, regex };
  } catch (err) {
    return {
      success: false,
      error: `Invalid regex syntax: ${extractErrorMessage(err)}`,
      fallbackToLiteral: true,
    };
  }
}

/**
 * Execute a regex with input length validation
 *
 * This is a basic safeguard - input length limits prevent processing extremely
 * long strings even with safe patterns.
 *
 * Note: This does NOT provide timeout enforcement. For true ReDoS protection,
 * rely on:
 * 1. RE2 engine (if available) which guarantees linear time
 * 2. safe-regex2 validation (catches most catastrophic backtracking)
 * 3. Input length limits (this function)
 *
 * @param regex - The compiled regex
 * @param input - The input string to test
 * @returns The match result, or null if there is no match, the input is too long, or execution fails
 *
 * @example
 * ```ts
 * const result = compileSafeRegex('hello.*world', 'i');
 * if (result.success) {
 *   const matches = execRegexSafe(result.regex, 'Hello World');
 * }
 * ```
 */
export function execRegexSafe(regex: RegExp, input: string): RegExpExecArray | null {
  // Enforce input length limit
  if (getRegexInputLengthError(input)) {
    return null;
  }

  try {
    regex.lastIndex = 0;
    return regex.exec(input);
  } catch {
    return null;
  }
}
