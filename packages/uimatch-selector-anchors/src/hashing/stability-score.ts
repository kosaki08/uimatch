import type { ProbeResult } from '@uimatch/selector-spi';
import type { SelectorHint } from '../types/schema.js';

/**
 * Stability score for a selector
 */
export interface StabilityScore {
  /**
   * Overall stability score (0-1, higher is more stable)
   */
  overall: number;

  /**
   * Breakdown of score components
   */
  breakdown: {
    /**
     * Score based on selector hint quality (0-1)
     */
    hintQuality: number;

    /**
     * Score based on snippet hash match (0-1)
     */
    snippetMatch: number;

    /**
     * Score based on liveness check (0-1)
     */
    liveness: number;

    /**
     * Score based on selector specificity (0-1)
     */
    specificity: number;
  };

  /**
   * Detailed explanation of score
   */
  details: string[];
}

/**
 * Options for calculating stability score
 */
export interface StabilityScoreOptions {
  /**
   * Weights for each score component (must sum to 1.0)
   * @default { hintQuality: 0.4, snippetMatch: 0.2, liveness: 0.3, specificity: 0.1 }
   */
  weights?: {
    hintQuality?: number;
    snippetMatch?: number;
    liveness?: number;
    specificity?: number;
  };
}

/**
 * Calculate hint quality score based on selector strategy preferences
 */
function calculateHintQualityScore(hint?: SelectorHint): number {
  if (!hint || !hint.prefer || hint.prefer.length === 0) {
    return 0.3; // Default score for no hint
  }

  // Strategy quality scores (higher is more stable)
  const strategyScores: Record<string, number> = {
    testid: 1.0, // Most stable - explicit test identifiers
    role: 0.8, // Stable - semantic accessibility roles
    text: 0.5, // Moderate - can change with content
    css: 0.3, // Least stable - prone to styling changes
  };

  // Use the highest quality strategy
  const topStrategy = hint.prefer[0];
  if (!topStrategy) return 0.3;

  return strategyScores[topStrategy] || 0.3;
}

/**
 * Calculate snippet match score
 * @param snippetMatched - Whether the snippet hash matched
 * @returns Score between 0 and 1
 */
function calculateSnippetMatchScore(snippetMatched: boolean): number {
  return snippetMatched ? 1.0 : 0.0;
}

/**
 * Calculate liveness score based on liveness check result
 */
function calculateLivenessScore(livenessResult?: ProbeResult): number {
  if (!livenessResult) {
    return 0.5; // Default score when liveness not checked
  }

  // Support both isValid (preferred) and isAlive (backward compatibility)
  const isAlive = livenessResult.isValid ?? livenessResult.isAlive ?? false;

  if (isAlive) {
    return 1.0; // Element is alive and visible
  }

  return 0.0; // Element not found
}

/**
 * Parse weight from environment variable with validation
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set or invalid
 * @returns Parsed weight or default
 */
function getWeightFromEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }
  return parsed;
}

/**
 * Load weights from environment variables with normalization
 * Ensures the sum of weights equals 1.0
 * @returns Normalized weights object
 */
function getEnvWeights(): {
  hintQuality: number;
  snippetMatch: number;
  liveness: number;
  specificity: number;
} {
  const weights = {
    hintQuality: getWeightFromEnv('UIMATCH_STABILITY_HINT_WEIGHT', 0.4),
    snippetMatch: getWeightFromEnv('UIMATCH_STABILITY_SNIPPET_WEIGHT', 0.2),
    liveness: getWeightFromEnv('UIMATCH_STABILITY_LIVENESS_WEIGHT', 0.3),
    specificity: getWeightFromEnv('UIMATCH_STABILITY_SPECIFICITY_WEIGHT', 0.1),
  };

  // Normalize to sum = 1.0
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) {
    // All zero, fallback to defaults
    return {
      hintQuality: 0.4,
      snippetMatch: 0.2,
      liveness: 0.3,
      specificity: 0.1,
    };
  }

  // Normalize each weight
  return {
    hintQuality: weights.hintQuality / sum,
    snippetMatch: weights.snippetMatch / sum,
    liveness: weights.liveness / sum,
    specificity: weights.specificity / sum,
  };
}

/**
 * Normalize selector specificity to 0-1 score for stability evaluation
 * More specific selectors are generally more stable
 * @remarks This is different from CSS specificity calculation in selector-utils.ts
 */
function normalizeSpecificityScore(selector: string): number {
  // data-testid: highest specificity
  if (selector.includes('data-testid')) {
    return 1.0;
  }

  // role with name: high specificity
  if (selector.startsWith('role:') && selector.includes('[name=')) {
    return 0.9;
  }

  // role alone: moderate-high specificity
  if (selector.startsWith('role:')) {
    return 0.7;
  }

  // ID selector: moderate specificity (includes compound selectors like button#id)
  if (selector.startsWith('#') || /#[_a-zA-Z][\w-]*/.test(selector)) {
    return 0.6;
  }

  // text: selector with exact match - moderate specificity
  // Higher than generic text but lower than structural selectors
  if (selector.startsWith('text:')) {
    // Check if it's exact match (contains quotes or is short)
    const hasExact = selector.includes('"') || selector.includes("'");
    const textContent = selector
      .replace(/^text:/, '')
      .replace(/['"]/g, '')
      .trim();
    const isShort = textContent.length <= 2;
    const isReasonableLength = textContent.length >= 5 && textContent.length <= 24;

    // Short text (<=2 chars) is prone to collision, score lower
    if (isShort) {
      return 0.4;
    }

    // Exact text match with reasonable length (5-24 chars) - safer than short text
    // Aligns with role[name]=0.9 and id=0.6 hierarchy
    if (hasExact && isReasonableLength) {
      return 0.6;
    }

    // Exact text match but longer or shorter (outside safe range)
    if (hasExact) {
      return 0.55;
    }

    // Generic text selector
    return 0.5;
  }

  // Attribute selectors: moderate specificity
  if (selector.includes('[')) {
    return 0.5;
  }

  // Class selector: low specificity
  if (selector.startsWith('.')) {
    return 0.3;
  }

  // Tag selector: lowest specificity
  return 0.2;
}

/**
 * Calculate stability score for a selector
 *
 * @param params - Score calculation parameters
 * @param options - Calculation options
 * @returns Stability score
 */
export function calculateStabilityScore(
  params: {
    selector: string;
    hint?: SelectorHint;
    snippetMatched?: boolean;
    livenessResult?: ProbeResult;
  },
  options: StabilityScoreOptions = {}
): StabilityScore {
  // Load base weights from environment variables (normalized)
  const envWeights = getEnvWeights();

  // Merge with user-provided weights (options override env)
  const mergedWeights = {
    ...envWeights,
    ...options.weights,
  };

  // Re-normalize after merging to ensure sum = 1.0
  const sum = Object.values(mergedWeights).reduce((a, b) => a + b, 0);
  const weights =
    sum === 0
      ? envWeights // Fallback to env weights if all zero
      : {
          hintQuality: mergedWeights.hintQuality / sum,
          snippetMatch: mergedWeights.snippetMatch / sum,
          liveness: mergedWeights.liveness / sum,
          specificity: mergedWeights.specificity / sum,
        };

  // Calculate component scores
  const hintQuality = calculateHintQualityScore(params.hint);
  const snippetMatch = calculateSnippetMatchScore(params.snippetMatched ?? false);
  const liveness = calculateLivenessScore(params.livenessResult);
  const specificity = normalizeSpecificityScore(params.selector);

  // Calculate weighted overall score
  const overall =
    hintQuality * weights.hintQuality +
    snippetMatch * weights.snippetMatch +
    liveness * weights.liveness +
    specificity * weights.specificity;

  // Generate details
  const details: string[] = [];

  details.push(`Hint quality: ${(hintQuality * 100).toFixed(0)}% (weight: ${weights.hintQuality})`);
  if (params.hint?.prefer) {
    details.push(`  Strategy: ${params.hint.prefer.join(' > ')}`);
  }

  details.push(
    `Snippet match: ${(snippetMatch * 100).toFixed(0)}% (weight: ${weights.snippetMatch})`
  );
  if (params.snippetMatched !== undefined) {
    details.push(`  Matched: ${params.snippetMatched ? 'yes' : 'no'}`);
  }

  details.push(`Liveness: ${(liveness * 100).toFixed(0)}% (weight: ${weights.liveness})`);
  if (params.livenessResult) {
    const isAlive = params.livenessResult.isValid ?? params.livenessResult.isAlive ?? false;
    details.push(`  Alive: ${isAlive ? 'yes' : 'no'}`);
  }

  details.push(`Specificity: ${(specificity * 100).toFixed(0)}% (weight: ${weights.specificity})`);
  details.push(`  Selector: ${params.selector}`);

  return {
    overall,
    breakdown: {
      hintQuality,
      snippetMatch,
      liveness,
      specificity,
    },
    details,
  };
}

/**
 * Compare stability scores and return the more stable one
 */
export function compareStabilityScores(a: StabilityScore, b: StabilityScore): number {
  return b.overall - a.overall; // Higher overall score is more stable
}

/**
 * Determine selector type priority (higher = more stable)
 * data-testid > id > role > aria > class > tag
 */
function getSelectorTypePriority(selector: string): number {
  if (selector.includes('[data-testid=')) return 1000;
  if (selector.includes('[data-test-id=')) return 1000;
  if (selector.includes('[data-test=')) return 1000;
  if (selector.startsWith('#')) return 900; // ID selector
  if (selector.includes('role=')) return 800;
  if (selector.includes('[role=')) return 800;
  if (selector.includes('[aria-')) return 700;
  if (selector.includes('.')) return 300; // Class selector
  return 100; // Tag selector
}

/**
 * Find the most stable selector from a list with their scores
 * Prioritizes data-testid selectors even if overall score is slightly lower
 */
export function findMostStableSelector(
  scores: Array<{ selector: string; score: StabilityScore }>
): { selector: string; score: StabilityScore } | null {
  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((best, current) => {
    const bestPriority = getSelectorTypePriority(best.selector);
    const currentPriority = getSelectorTypePriority(current.selector);

    // If type priority differs significantly (>100), prefer higher priority
    if (currentPriority - bestPriority > 100) {
      return current;
    }
    if (bestPriority - currentPriority > 100) {
      return best;
    }

    // Same type priority, use overall score
    return current.score.overall > best.score.overall ? current : best;
  });
}
