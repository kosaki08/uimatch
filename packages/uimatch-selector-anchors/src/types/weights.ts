/**
 * Anchor matching weights configuration
 */

/**
 * Scoring weights for anchor matching algorithm
 */
export interface AnchorMatchingWeights {
  exactLastKnownMatch: number;
  partialLastKnownMatch: number;
  testidHintMatch: number;
  roleHintMatch: number;
  componentMetadataMatch: number;
  hasSnippetHash: number;
  recentUpdate: number;
  highStability: number;
}

/**
 * Threshold values for conditional scoring
 */
export interface AnchorMatchingThresholds {
  recentUpdateDays: number;
  highStabilityScore: number;
}

/**
 * Complete anchor matching configuration
 */
export interface AnchorMatchingConfig {
  weights: AnchorMatchingWeights;
  thresholds: AnchorMatchingThresholds;
}

/**
 * Get default anchor matching weights.
 * Values are embedded directly to avoid distribution issues with JSON assets.
 */
export function getAnchorMatchingConfig(): AnchorMatchingConfig {
  return {
    weights: {
      exactLastKnownMatch: 100,
      partialLastKnownMatch: 50,
      testidHintMatch: 80,
      roleHintMatch: 70,
      componentMetadataMatch: 30,
      hasSnippetHash: 10,
      recentUpdate: 5,
      highStability: 15,
    },
    thresholds: {
      recentUpdateDays: 30,
      highStabilityScore: 80,
    },
  };
}
