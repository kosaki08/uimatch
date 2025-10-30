/**
 * Style Fidelity Score (SFS) calculation utilities
 * Normalizes style diffs and computes weighted scores for LLM consumption
 */

import type { StyleDiff } from 'uimatch-core';

/**
 * Category weights for SFS calculation
 */
export interface CategoryWeights {
  color: number;
  spacing: number;
  typography: number;
  layout: number;
  radius: number;
  border: number;
  shadow: number;
  pixel: number;
}

/**
 * Default category weights (can be overridden)
 */
export const DEFAULT_WEIGHTS: CategoryWeights = {
  color: 1.2,
  spacing: 1.0,
  typography: 1.0,
  layout: 1.2, // High weight - layout issues cause major visual breakage
  radius: 0.8,
  border: 0.8,
  shadow: 0.8,
  pixel: 1.0,
};

/**
 * Tolerance thresholds for normalization
 */
export interface ToleranceThresholds {
  deltaE: number;
  spacing: number; // ratio
  dimension: number; // ratio
  layoutGap: number; // ratio
  radius: number; // ratio
  borderWidth: number; // ratio
  shadowBlur: number; // ratio
  shadowColorExtraDE: number;
}

/**
 * Default tolerances (from uimatch-core defaults)
 */
export const DEFAULT_TOLERANCES: ToleranceThresholds = {
  deltaE: 3.0,
  spacing: 0.15,
  dimension: 0.05,
  layoutGap: 0.1,
  radius: 0.12,
  borderWidth: 0.3,
  shadowBlur: 0.15,
  shadowColorExtraDE: 1.0,
};

/**
 * Normalized style diff (0-1 scale)
 */
export interface NormalizedStyleDiff {
  selector: string;
  property: string;
  severity: 'low' | 'medium' | 'high';
  category:
    | 'color'
    | 'spacing'
    | 'typography'
    | 'layout'
    | 'radius'
    | 'border'
    | 'shadow'
    | 'pixel'
    | 'other';
  normalizedScore: number; // 0 = perfect match, 1 = max deviation
  actual: string;
  expected: string;
  delta: number | string;
  unit: 'px' | 'ΔE' | 'categorical';
}

/**
 * Category breakdown for reporting
 */
export interface CategoryBreakdown {
  category: string;
  count: number;
  avgNormalizedScore: number;
  weight: number;
}

/**
 * Style summary metrics
 */
export interface StyleSummary {
  styleFidelityScore: number; // 0-100
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalDiffs: number;
  categoryBreakdown: CategoryBreakdown[];
  coverage: number; // ratio of compared properties / expected properties
  autofixableCount: number; // high-confidence fixes
}

/**
 * Infer category from CSS property name
 */
function inferCategory(property: string): NormalizedStyleDiff['category'] {
  const prop = property.toLowerCase();

  // Color properties
  if (
    prop.includes('color') ||
    prop === 'fill' ||
    prop === 'stroke' ||
    prop.includes('background')
  ) {
    return 'color';
  }

  // Layout properties - high impact on visual structure
  if (
    prop === 'display' ||
    prop === 'position' ||
    prop.includes('flex-') ||
    prop === 'flex-direction' ||
    prop === 'flex-wrap' ||
    prop === 'flex-flow' ||
    prop === 'justify-content' ||
    prop === 'align-items' ||
    prop === 'align-content' ||
    prop === 'align-self' ||
    prop.includes('grid-') ||
    prop === 'grid-template-columns' ||
    prop === 'grid-template-rows' ||
    prop === 'grid-template-areas' ||
    prop === 'grid-auto-columns' ||
    prop === 'grid-auto-rows' ||
    prop === 'grid-auto-flow' ||
    prop.includes('place-')
  ) {
    return 'layout';
  }

  // Spacing properties
  if (
    prop.includes('padding') ||
    prop.includes('margin') ||
    prop === 'inset' ||
    prop.includes('gap')
  ) {
    return 'spacing';
  }

  // Typography properties
  if (
    prop.includes('font') ||
    prop.includes('line-height') ||
    prop.includes('letter-spacing') ||
    prop.includes('text')
  ) {
    return 'typography';
  }

  // Radius properties
  if (prop.includes('radius')) {
    return 'radius';
  }

  // Border properties
  if (prop.includes('border') && !prop.includes('radius')) {
    return 'border';
  }

  // Shadow properties
  if (prop.includes('shadow')) {
    return 'shadow';
  }

  return 'other';
}

/**
 * Normalize a single style diff value to 0-1 scale
 */
function normalizeStyleDiff(
  diff: StyleDiff,
  property: string,
  tolerances: ToleranceThresholds
): number {
  const category = inferCategory(property);
  const propData = diff.properties[property];
  if (!propData) return 0;

  const { delta, unit } = propData;

  // Color normalization: ΔE / threshold
  if (unit === 'ΔE') {
    const threshold = category === 'shadow' ? tolerances.shadowColorExtraDE : tolerances.deltaE;
    return Math.min(Math.abs(Number(delta)) / threshold, 1);
  }

  // Pixel-based normalization
  if (unit === 'px') {
    const numDelta = Math.abs(Number(delta));

    // Get appropriate tolerance based on category and property
    let toleranceRatio = 0.15; // default

    if (category === 'spacing') {
      if (property.includes('gap')) {
        toleranceRatio = tolerances.layoutGap;
      } else {
        toleranceRatio = tolerances.spacing;
      }
    } else if (category === 'radius') {
      toleranceRatio = tolerances.radius;
    } else if (category === 'border' && property.includes('width')) {
      toleranceRatio = tolerances.borderWidth;
    } else if (category === 'shadow' && property.includes('blur')) {
      toleranceRatio = tolerances.shadowBlur;
    } else if (category === 'typography') {
      toleranceRatio = 0.08; // 8% for font sizes
    } else if (property.includes('width') || property.includes('height')) {
      toleranceRatio = tolerances.dimension;
    }

    // Calculate tolerance in pixels from expected value
    const expectedValue = parseFloat(propData.expected ?? '0') || 0;
    const tolerancePx = Math.max(1, Math.abs(expectedValue * toleranceRatio));

    return Math.min(numDelta / tolerancePx, 1);
  }

  // Categorical mismatch (display, justify-content, etc.)
  if (unit === 'categorical' || typeof delta === 'string') {
    return propData.actual !== propData.expected ? 1 : 0;
  }

  return 0;
}

/**
 * Normalize all style diffs
 */
export function normalizeStyleDiffs(
  styleDiffs: StyleDiff[],
  tolerances: ToleranceThresholds = DEFAULT_TOLERANCES
): NormalizedStyleDiff[] {
  const normalized: NormalizedStyleDiff[] = [];

  for (const diff of styleDiffs) {
    for (const [property, propData] of Object.entries(diff.properties)) {
      // Skip entries with missing required fields
      if (
        propData.actual === undefined ||
        propData.expected === undefined ||
        propData.delta === undefined ||
        propData.unit === undefined
      ) {
        continue;
      }

      const score = normalizeStyleDiff(diff, property, tolerances);
      normalized.push({
        selector: diff.selector,
        property,
        severity: diff.severity,
        category: inferCategory(property),
        normalizedScore: score,
        actual: propData.actual,
        expected: propData.expected,
        delta: propData.delta,
        unit: propData.unit as 'px' | 'ΔE' | 'categorical',
      });
    }
  }

  return normalized;
}

/**
 * Calculate Style Fidelity Score (SFS) from normalized diffs
 */
export function calculateStyleFidelityScore(
  normalized: NormalizedStyleDiff[],
  weights: Partial<CategoryWeights> = {},
  expectedPropertyCount?: number
): StyleSummary {
  const finalWeights = { ...DEFAULT_WEIGHTS, ...weights };

  // Calculate coverage: compared properties / expected properties
  const comparedCount = normalized.length;
  const coverage =
    expectedPropertyCount && expectedPropertyCount > 0
      ? Math.min(1.0, comparedCount / expectedPropertyCount)
      : comparedCount > 0
        ? 1.0
        : 0.0;

  if (normalized.length === 0) {
    return {
      styleFidelityScore: 100,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalDiffs: 0,
      categoryBreakdown: [],
      coverage,
      autofixableCount: 0,
    };
  }

  // Count by severity
  const highCount = normalized.filter((d) => d.severity === 'high').length;
  const mediumCount = normalized.filter((d) => d.severity === 'medium').length;
  const lowCount = normalized.filter((d) => d.severity === 'low').length;

  // Group by category
  const categoryMap = new Map<string, NormalizedStyleDiff[]>();
  for (const diff of normalized) {
    const existing = categoryMap.get(diff.category) || [];
    existing.push(diff);
    categoryMap.set(diff.category, existing);
  }

  // Calculate category breakdown
  const categoryBreakdown: CategoryBreakdown[] = [];
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [category, diffs] of categoryMap.entries()) {
    const avgScore = diffs.reduce((sum, d) => sum + d.normalizedScore, 0) / diffs.length;
    const weight = finalWeights[category as keyof CategoryWeights] ?? 1.0;

    categoryBreakdown.push({
      category,
      count: diffs.length,
      avgNormalizedScore: avgScore,
      weight,
    });

    totalWeightedScore += avgScore * weight * diffs.length;
    totalWeight += weight * diffs.length;
  }

  // Calculate SFS (0-100 scale, 100 = perfect)
  const avgWeightedScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  const styleFidelityScore = Math.round(100 * (1 - avgWeightedScore));

  // Count autofixable (high confidence): token-based colors or small px deltas
  const autofixableCount = normalized.filter((d) => {
    // Color diffs with expected tokens are autofixable
    if (d.category === 'color' && d.unit === 'ΔE') {
      return true; // Assume token-based if ΔE is small
    }
    // Small pixel diffs with clear expected values
    if (d.unit === 'px' && d.normalizedScore < 0.3) {
      return true;
    }
    return false;
  }).length;

  return {
    styleFidelityScore,
    highCount,
    mediumCount,
    lowCount,
    totalDiffs: normalized.length,
    categoryBreakdown,
    coverage,
    autofixableCount,
  };
}

/**
 * Check if a property key is an auxiliary key (helper for visualization, not a real CSS property)
 */
function isAuxiliaryKey(key: string): boolean {
  return key.startsWith('box-shadow-offset-');
}

/**
 * Compute style summary from raw StyleDiff array
 */
export function computeStyleSummary(
  styleDiffs: StyleDiff[],
  tolerances?: ToleranceThresholds,
  weights?: Partial<CategoryWeights>
): StyleSummary {
  // Count expected properties across all style diffs (exclude auxiliary keys)
  const expectedPropertyCount = styleDiffs.reduce((total, diff) => {
    return (
      total +
      Object.entries(diff.properties).filter(
        ([key, prop]) => !isAuxiliaryKey(key) && prop.expected !== undefined
      ).length
    );
  }, 0);

  const normalized = normalizeStyleDiffs(styleDiffs, tolerances);
  return calculateStyleFidelityScore(normalized, weights, expectedPropertyCount);
}
