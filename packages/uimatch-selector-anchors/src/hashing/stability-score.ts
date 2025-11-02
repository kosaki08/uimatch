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
 * Calculate selector specificity score
 * More specific selectors are generally more stable
 */
function calculateSpecificityScore(selector: string): number {
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

  // ID selector: moderate specificity
  if (selector.startsWith('#')) {
    return 0.6;
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
  // Default weights
  const weights = {
    hintQuality: 0.4,
    snippetMatch: 0.2,
    liveness: 0.3,
    specificity: 0.1,
    ...options.weights,
  };

  // Calculate component scores
  const hintQuality = calculateHintQualityScore(params.hint);
  const snippetMatch = calculateSnippetMatchScore(params.snippetMatched ?? false);
  const liveness = calculateLivenessScore(params.livenessResult);
  const specificity = calculateSpecificityScore(params.selector);

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
 * Find the most stable selector from a list with their scores
 */
export function findMostStableSelector(
  scores: Array<{ selector: string; score: StabilityScore }>
): { selector: string; score: StabilityScore } | null {
  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((best, current) =>
    current.score.overall > best.score.overall ? current : best
  );
}
