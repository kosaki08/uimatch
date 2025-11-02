/**
 * Safe regex compilation utility with ReDoS protection
 *
 * @module safe-regex
 */

/**
 * Maximum allowed regex pattern length to prevent extremely long patterns
 */
const MAX_PATTERN_LENGTH = 300;

/**
 * Regex to detect potentially dangerous nested quantifiers
 * Matches patterns like ((...)*)* or similar deep nesting (5+ nested groups)
 */
const DANGEROUS_NESTING = /(\([^()]*){5,}/;

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
 * - Excessively long patterns (>300 chars)
 * - Deep nested quantifiers that could cause ReDoS
 * - Invalid regex syntax
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
export function compileSafeRegex(pattern: string, flags?: string): SafeRegexResult {
  // Check pattern length
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      success: false,
      error: `Regex pattern too long (${pattern.length} > ${MAX_PATTERN_LENGTH})`,
      fallbackToLiteral: true,
    };
  }

  // Check for dangerous nesting patterns
  if (DANGEROUS_NESTING.test(pattern)) {
    return {
      success: false,
      error: 'Potentially dangerous nested quantifiers detected',
      fallbackToLiteral: true,
    };
  }

  // Try to compile the regex
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
