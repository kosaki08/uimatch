import { normalizeTextEx, textSimilarity } from './normalize';

/**
 * Options for text comparison
 */
export interface TextCompareOptions {
  /**
   * Case-sensitive comparison
   * @default false (case-insensitive)
   */
  caseSensitive?: boolean;

  /**
   * Threshold for considering texts as "similar"
   * Range: 0-1, where 1.0 = identical
   * @default 0.9
   */
  similarityThreshold?: number;
}

/**
 * Classification of text differences
 */
export type TextDiffKind =
  /** Texts are identical without any modification */
  | 'exact-match'
  /** Texts differ only in whitespace, case, or NFKC normalization */
  | 'whitespace-or-case-only'
  /** Texts are similar after normalization (above similarity threshold) */
  | 'normalized-match'
  /** Texts are fundamentally different */
  | 'mismatch';

/**
 * Result of text comparison
 */
export interface TextDiff {
  /** Original expected text */
  expected: string;

  /** Original actual text */
  actual: string;

  /** Normalized expected text */
  normalizedExpected: string;

  /** Normalized actual text */
  normalizedActual: string;

  /** True if raw texts are identical */
  equalRaw: boolean;

  /** True if normalized texts are identical */
  equalNormalized: boolean;

  /**
   * Similarity score (0-1)
   * Calculated based on token overlap and character position matching
   */
  similarity: number;

  /** Classification of the difference */
  kind: TextDiffKind;
}

/**
 * Compare two texts with normalization and similarity analysis.
 *
 * This function performs multi-level text comparison:
 * 1. Raw string equality check
 * 2. Normalized equality check (NFKC, whitespace, case)
 * 3. Similarity scoring for partial matches
 *
 * @example
 * ```ts
 * const diff = compareText('Sign in', 'SIGN  IN');
 * // {
 * //   kind: 'whitespace-or-case-only',
 * //   equalRaw: false,
 * //   equalNormalized: true,
 * //   similarity: 1.0
 * // }
 * ```
 *
 * @example
 * ```ts
 * const diff = compareText('Email address', 'E-mail adress');
 * // {
 * //   kind: 'mismatch',
 * //   equalRaw: false,
 * //   equalNormalized: false,
 * //   similarity: 0.74
 * // }
 * ```
 *
 * @param expected - The expected text (e.g., from Figma design)
 * @param actual - The actual text (e.g., from implementation)
 * @param opts - Comparison options
 * @returns Detailed comparison result
 */
export function compareText(
  expected: string,
  actual: string,
  opts: TextCompareOptions = {}
): TextDiff {
  const { caseSensitive = false, similarityThreshold = 0.9 } = opts;

  // Check raw equality first
  const equalRaw = expected === actual;

  // Normalize both texts for comparison
  const normalizedExpected = normalizeTextEx(expected, {
    nfkc: true,
    trim: true,
    collapseWhitespace: true,
    caseSensitive,
  });

  const normalizedActual = normalizeTextEx(actual, {
    nfkc: true,
    trim: true,
    collapseWhitespace: true,
    caseSensitive,
  });

  const equalNormalized = normalizedExpected === normalizedActual;

  // Calculate similarity score
  const similarity = textSimilarity(normalizedExpected, normalizedActual);

  // Classify the difference
  let kind: TextDiffKind;

  if (equalRaw) {
    kind = 'exact-match';
  } else if (equalNormalized) {
    // Different in raw form, but identical after normalization
    // → Only whitespace, case, or NFKC differences
    kind = 'whitespace-or-case-only';
  } else if (similarity >= similarityThreshold) {
    // Similar but not identical after normalization
    kind = 'normalized-match';
  } else {
    // Fundamentally different texts
    kind = 'mismatch';
  }

  return {
    expected,
    actual,
    normalizedExpected,
    normalizedActual,
    equalRaw,
    equalNormalized,
    similarity,
    kind,
  };
}
