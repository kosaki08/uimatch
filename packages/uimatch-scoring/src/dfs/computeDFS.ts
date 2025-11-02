/**
 * Design Fidelity Score (DFS) calculation
 *
 * Extracted from compare.ts (lines 381-434) for reusability
 */

import type { DFSInput, DFSResult, DFSWeights } from './types';

/**
 * Default weights for DFS calculation
 */
const DEFAULT_WEIGHTS: DFSWeights = {
  pixel: 1.0,
  color: 1.0,
  spacing: 1.0,
  radius: 1.0,
  border: 1.0,
  shadow: 1.0,
  typography: 1.0,
};

/**
 * Calculate Design Fidelity Score (0-100) with optional weights
 *
 * Base score of 100, with weighted deductions for differences:
 * - Pixel difference penalty (up to -50 points)
 * - Color delta E penalty (up to -30 points)
 * - Size mismatch penalty (up to -15 points)
 * - High severity style diff penalty (-20 points)
 *
 * @param input - Comparison results and style diffs
 * @returns DFS result with score (0-100)
 */
export function computeDFS(input: DFSInput): DFSResult {
  const { result, styleDiffs, weights: userWeights } = input;

  // Merge user weights with defaults
  const weights: DFSWeights = {
    ...DEFAULT_WEIGHTS,
    ...userWeights,
  };

  // Extract metrics from comparison result
  const effectivePixelDiffRatio = result.pixelDiffRatioContent ?? result.pixelDiffRatio;
  const colorDeltaEAvg = result.colorDeltaEAvg ?? 0;
  const hasHighSeverity = styleDiffs.some((d) => d.severity === 'high');

  // Base score of 100, with weighted deductions for differences
  let dfs = 100;

  // Pixel difference penalty (up to -50 points)
  // 0% diff = 0 penalty, 100% diff = -50 penalty
  // Use effective ratio (content-only when available) for more accurate scoring
  dfs -= effectivePixelDiffRatio * 50 * weights.pixel;

  // Color delta E penalty (up to -30 points)
  // 0 ΔE = 0 penalty, 10+ ΔE = -30 penalty
  dfs -= Math.min(colorDeltaEAvg / 10, 1) * 30 * weights.color;

  // Size mismatch penalty (up to -15 points)
  // When dimensions differ and required padding/cropping (adjusted=true),
  // penalize based on relative area difference to reflect layout discrepancies.
  // This addresses cases where most pixels match but fundamental layout differs.
  if (result.dimensions.adjusted) {
    const figmaDim = result.dimensions.figma;
    const implDim = result.dimensions.impl;
    const areaFigma = figmaDim.width * figmaDim.height;
    const areaImpl = implDim.width * implDim.height;
    const areaGap = Math.abs(areaFigma - areaImpl) / Math.max(areaFigma, areaImpl); // 0..1
    // Apply up to 15 points penalty, scaled by area difference (20 max * 0.75 cap)
    const sizePenalty = Math.min(15, Math.round(areaGap * 20));
    dfs -= sizePenalty;
  }

  // High severity style diff penalty (-20 points)
  // Only applies when expectedSpec provided and high-severity diffs detected
  if (hasHighSeverity) {
    const maxWeight = Math.max(
      weights.color,
      weights.spacing,
      weights.typography,
      weights.border,
      weights.shadow,
      weights.radius
    );
    dfs -= 20 * maxWeight;
  }

  // Ensure DFS is in range [0, 100]
  dfs = Math.max(0, Math.min(100, Math.round(dfs)));

  return { score: dfs };
}
