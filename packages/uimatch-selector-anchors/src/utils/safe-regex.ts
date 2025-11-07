/**
 * Safe regex compilation utility with ReDoS protection
 *
 * @module safe-regex
 */

import safe from 'safe-regex2';

/**
 * Maximum allowed regex pattern length to prevent extremely long patterns
 * Increased to 500 to accommodate large HTML fragments without performance impact
 */
const MAX_PATTERN_LENGTH = 500;

/**
 * Maximum input length for regex execution to prevent excessive processing time
 */
const MAX_INPUT_LENGTH = 10000;

/**
 * RE2 engine instance (loaded lazily if available)
 * RE2 provides linear-time regex execution, preventing ReDoS attacks
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-redundant-type-constituents
let RE2: any | null = null;
let RE2_LOAD_ATTEMPTED = false;

/**
 * Attempt to load RE2 engine (optional dependency)
 * @returns Promise that resolves when load attempt is complete
 */
async function loadRE2(): Promise<void> {
  if (RE2_LOAD_ATTEMPTED) return;
  RE2_LOAD_ATTEMPTED = true;

  try {
    // Dynamic import with type assertion to avoid type errors for optional dependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const re2Module = await import('re2' as any);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    RE2 = re2Module.default ?? re2Module.RE2;
  } catch {
    // RE2 not available - will use safe-regex2 validation + standard RegExp
  }
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
export async function compileSafeRegex(
  pattern: string,
  flags?: string
): Promise<SafeRegexResult> {
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
  await loadRE2();

  // Try to compile with RE2 if available (linear-time guarantee)
  if (RE2) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const regex = new RE2(pattern, flags);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      return { success: true, regex };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `RE2 compilation failed: ${message}`,
        fallbackToLiteral: true,
      };
    }
  }

  // Fallback to standard RegExp (already validated by safe-regex2)
  try {
    const regex = new RegExp(pattern, flags);
    return { success: true, regex };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Invalid regex syntax: ${message}`,
      fallbackToLiteral: true,
    };
  }
}

/**
 * Execute regex test with input length validation
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
 * @returns true if matches, false otherwise or if input is too long
 *
 * @example
 * ```ts
 * const result = compileSafeRegex('hello.*world', 'i');
 * if (result.success) {
 *   const matches = execRegexSafe(result.regex, 'Hello World');
 * }
 * ```
 */
export function execRegexSafe(regex: RegExp, input: string): boolean {
  // Enforce input length limit
  if (input.length > MAX_INPUT_LENGTH) {
    return false;
  }

  try {
    return regex.test(input);
  } catch {
    // Any error during execution - return false
    return false;
  }
}
