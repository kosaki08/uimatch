/**
 * Anchor matching weights configuration
 */

import weightsData from './weights.json';

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
 * Get default anchor matching weights from configuration file
 */
export function getAnchorMatchingConfig(): AnchorMatchingConfig {
  return weightsData as AnchorMatchingConfig;
}
