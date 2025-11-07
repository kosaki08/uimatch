/**
 * Type definitions for RE2 optional dependency
 *
 * RE2 is a fast, safe, thread-friendly alternative to backtracking regular expression engines
 * like those used in PCRE, Perl, and Python.
 *
 * @see https://github.com/uhop/node-re2
 */

/**
 * RE2 regex flags
 */
export type RE2Flags = string;

/**
 * RE2 regex class interface
 *
 * Provides a subset of standard RegExp API with guaranteed linear-time complexity
 */
export interface RE2RegExp extends RegExp {
  /**
   * Test if the pattern matches the string
   */
  test(str: string): boolean;

  /**
   * Execute the pattern against the string
   */
  exec(str: string): RegExpExecArray | null;

  /**
   * The source pattern
   */
  readonly source: string;

  /**
   * The flags used
   */
  readonly flags: string;
}

/**
 * RE2 constructor interface
 */
export interface RE2Constructor {
  new (pattern: string, flags?: RE2Flags): RE2RegExp;
  (pattern: string, flags?: RE2Flags): RE2RegExp;
}

/**
 * RE2 module structure (default export)
 */
export interface RE2Module {
  default: RE2Constructor;
  RE2: RE2Constructor;
}

/**
 * Type guard to check if a value is a valid RE2 constructor
 */
export function isRE2Constructor(value: unknown): value is RE2Constructor {
  return (
    typeof value === 'function' &&
    value.length >= 1 && // Constructor should accept at least pattern parameter
    value.length <= 2 // Constructor should accept at most pattern + flags
  );
}

/**
 * Type guard to check if a value is a valid RE2 module
 */
export function isRE2Module(value: unknown): value is RE2Module {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const module = value as Record<string, unknown>;
  return isRE2Constructor(module.default) || isRE2Constructor(module.RE2);
}

/**
 * Extract RE2 constructor from module safely
 */
export function extractRE2Constructor(module: unknown): RE2Constructor | null {
  if (!isRE2Module(module)) {
    return null;
  }

  return module.default ?? module.RE2;
}
