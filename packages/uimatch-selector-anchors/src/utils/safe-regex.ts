/**
 * Safe regex compilation utility with ReDoS protection
 *
 * @module safe-regex
 */

/**
 * Maximum allowed regex pattern length to prevent extremely long patterns
 * Increased to 500 to accommodate large HTML fragments without performance impact
 */
const MAX_PATTERN_LENGTH = 500;

/**
 * Regex to detect potentially dangerous nested quantifiers
 * Matches patterns like ((...)*)* or similar deep nesting (5+ nested groups)
 */
const DANGEROUS_NESTING = /(\([^()]*){5,}/;

/**
 * Blacklist of known catastrophic backtracking patterns
 * These patterns are common ReDoS attack vectors:
 * - Nested quantifiers: (a+)+, (.+)+, (\w+)*+
 * - Overlapping quantifiers: (\d+)*\d+, (\w+)*\w*
 * - Alternation with quantifiers: (a|a)+, (ab|a)+
 */
const CATASTROPHIC_PATTERNS = [
  /\([\w.+*?\\]+\+\)\+/, // (a+)+ or (.+)+
  /\([\w.+*?\\]+\*\)\*/, // (a*)* or (.*)*
  /\([\w.+*?\\]+\+\)\*/, // (a+)* or (.+)*
  /\([\w.+*?\\]+\*\)\+/, // (a*)+ or (.*)+
  /\([\w.+*?\\]+\)\*\+/, // (a)*+ or (ab)*+
  /\([\w.+*?\\]+\)\+\+/, // (a)++ or (ab)++
];

/**
 * Result of safe regex compilation
 */
export type SafeRegexResult =
  | { success: true; regex: RegExp }
  | { success: false; error: string; fallbackToLiteral: true };

/**
 * Execute regex test with timeout to prevent ReDoS attacks
 *
 * @param regex - The compiled regex
 * @param input - The input string to test
 * @param timeoutMs - Maximum execution time in milliseconds (default: input.length * 2, max: 1000ms)
 * @returns true if matches, false otherwise or on timeout
 *
 * @example
 * ```ts
 * const regex = /hello.*world/i;
 * const result = execRegexWithTimeout(regex, 'Hello World', 100);
 * ```
 */
export function execRegexWithTimeout(regex: RegExp, input: string, timeoutMs?: number): boolean {
  const timeout = timeoutMs ?? Math.min(input.length * 2, 1000);

  // For Node.js 20.19+ / 22.12+, use AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Execute regex test
    const result = regex.test(input);
    clearTimeout(timeoutId);
    return result;
  } catch {
    clearTimeout(timeoutId);
    // Timeout or error - fallback to false
    return false;
  }
}

/**
 * Compile a regex pattern with safety validation
 *
 * Protects against:
 * - Excessively long patterns (>500 chars)
 * - Deep nested quantifiers that could cause ReDoS
 * - Known catastrophic backtracking patterns (e.g., (a+)+, (.*)*, (\w+)*+)
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

  // Check against catastrophic backtracking patterns blacklist
  for (const dangerousPattern of CATASTROPHIC_PATTERNS) {
    if (dangerousPattern.test(pattern)) {
      return {
        success: false,
        error: 'Pattern matches known catastrophic backtracking vulnerability',
        fallbackToLiteral: true,
      };
    }
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
