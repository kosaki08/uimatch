/**
 * Quality Gate with automatic re-evaluation and composite scoring
 *
 * Key features:
 * 1. Automatic re-evaluation when pad mode inflates denominators
 * 2. Hard gates for area gap and suspicion detection
 * 3. Composite Quality Indicator (CQI) combining multiple metrics
 * 4. Suspicion rules for detecting problematic scenarios
 */

import type { StyleDiff } from '../types/index';
import type { CompareImageResult } from './compare';

/**
 * Hard gate violations that immediately fail quality check
 */
export interface HardGateViolation {
  type: 'area_gap' | 'suspicion' | 're_evaluation' | 'high_severity';
  reason: string;
  severity: 'critical' | 'high';
}

/**
 * Suspicion detection result
 */
export interface SuspicionDetection {
  detected: boolean;
  reasons: string[];
}

/**
 * Quality gate profile thresholds
 */
export interface QualityGateThresholds {
  /** Pixel difference ratio threshold (0-1) */
  pixelDiffRatio: number;
  /** Color delta E average threshold */
  deltaE: number;
  /** Area gap threshold for immediate failure (0-1) */
  areaGapCritical?: number;
  /** Area gap threshold for warning (0-1) */
  areaGapWarning?: number;
  /** Minimum style coverage ratio (0-1) to prevent false high scores */
  minStyleCoverage?: number;
}

/**
 * Composite Quality Indicator (CQI) calculation parameters
 */
export interface CQIParams {
  /** Pixel difference weight (default: 0.6) */
  pixelWeight?: number;
  /** Color delta weight (default: 0.2) */
  colorWeight?: number;
  /** Area gap weight (default: 0.15) */
  areaWeight?: number;
  /** High severity penalty weight (default: 0.05) */
  severityWeight?: number;
}

/**
 * Quality gate result
 */
export interface QualityGateResult {
  /** Overall pass/fail */
  pass: boolean;
  /** Composite Quality Indicator (0-100, higher is better) */
  cqi: number;
  /** Hard gate violations (immediate fail) */
  hardGateViolations: HardGateViolation[];
  /** Suspicion detection results */
  suspicions: SuspicionDetection;
  /** Re-evaluation was performed */
  reEvaluated: boolean;
  /** Original metrics before re-evaluation */
  originalMetrics?: {
    pixelDiffRatioContent: number;
    contentBasis: string;
  };
  /** Failure reasons (human-readable) */
  reasons: string[];
  /** Thresholds used */
  thresholds: {
    pixelDiffRatio: number;
    deltaE: number;
  };
}

/**
 * Calculate area gap between Figma and implementation
 * @param figmaDim - Figma dimensions
 * @param implDim - Implementation dimensions
 * @returns Area gap ratio (0-1)
 */
export function calculateAreaGap(
  figmaDim: { width: number; height: number },
  implDim: { width: number; height: number }
): number {
  const areaFigma = figmaDim.width * figmaDim.height;
  const areaImpl = implDim.width * implDim.height;
  return Math.abs(areaFigma - areaImpl) / Math.max(areaFigma, areaImpl);
}

/**
 * Detect suspicion indicators that suggest problematic comparison conditions
 * @param result - Comparison result
 * @param styleDiffs - Style differences
 * @returns Suspicion detection result
 */
export function detectSuspicions(
  result: CompareImageResult,
  styleDiffs: StyleDiff[]
): SuspicionDetection {
  const reasons: string[] = [];
  const { dimensions, pixelDiffRatioContent, contentCoverage } = result;
  const areaGap = calculateAreaGap(dimensions.figma, dimensions.impl);

  // Suspicion 1: High SFS but only root-level style diffs (suggests incomplete child comparison)
  const hasOnlyRootDiff = styleDiffs.length === 1 && styleDiffs[0]?.selector === '__self__';
  if (hasOnlyRootDiff && pixelDiffRatioContent !== undefined && pixelDiffRatioContent < 0.03) {
    reasons.push(
      'Only root style diff present despite low pixel difference - possible incomplete comparison'
    );
  }

  // Suspicion 2: Low pixel diff but high area gap (suggests page vs component mismatch)
  if (
    pixelDiffRatioContent !== undefined &&
    pixelDiffRatioContent < 0.03 &&
    areaGap > 0.2 &&
    dimensions.adjusted
  ) {
    reasons.push(
      `Low pixel diff (${(pixelDiffRatioContent * 100).toFixed(2)}%) but high area gap (${(areaGap * 100).toFixed(1)}%) - possible scale mismatch`
    );
  }

  // Suspicion 3: Full canvas content coverage with adjusted dimensions (union denominator issue)
  if (
    dimensions.adjusted &&
    contentCoverage !== undefined &&
    contentCoverage >= 0.95 &&
    dimensions.contentRect
  ) {
    const rect = dimensions.contentRect;
    const canvasWidth = dimensions.compared.width;
    const canvasHeight = dimensions.compared.height;
    const edgeThreshold = 2; // pixels

    // Check if content rect touches all edges (indicates union-based full canvas)
    const touchesAllEdges =
      rect.x1 <= edgeThreshold &&
      rect.y1 <= edgeThreshold &&
      rect.x2 >= canvasWidth - edgeThreshold &&
      rect.y2 >= canvasHeight - edgeThreshold;

    if (touchesAllEdges) {
      reasons.push(
        'Content rect spans entire canvas despite adjusted dimensions - union basis inflating denominator'
      );
    }
  }

  return {
    detected: reasons.length > 0,
    reasons,
  };
}

/**
 * Check if automatic re-evaluation should be triggered for pad mode
 * @param result - Comparison result
 * @param contentBasis - Current content basis mode
 * @returns True if re-evaluation should be performed
 */
export function shouldReEvaluate(result: CompareImageResult, contentBasis: string): boolean {
  const { dimensions, pixelDiffRatioContent, contentCoverage } = result;

  // Only re-evaluate for pad mode with adjusted dimensions
  if (dimensions.sizeMode !== 'pad' || !dimensions.adjusted) {
    return false;
  }

  // Only re-evaluate if using union basis
  if (contentBasis === 'intersection' || contentBasis === 'figma' || contentBasis === 'impl') {
    return false;
  }

  // Re-evaluate if content coverage is very high (>95%) but pixel diff is suspiciously low (<3%)
  if (
    contentCoverage !== undefined &&
    contentCoverage > 0.95 &&
    pixelDiffRatioContent !== undefined &&
    pixelDiffRatioContent < 0.03
  ) {
    return true;
  }

  return false;
}

/**
 * Calculate Composite Quality Indicator (CQI) score
 * @param metrics - Comparison metrics
 * @param thresholds - Quality gate thresholds
 * @param params - CQI calculation parameters
 * @returns CQI score (0-100, higher is better)
 */
export function calculateCQI(
  metrics: {
    pixelDiffRatioContent?: number;
    pixelDiffRatio: number;
    colorDeltaEAvg: number;
    areaGap: number;
    hasHighSeverity: boolean;
  },
  thresholds: QualityGateThresholds,
  params: CQIParams = {}
): number {
  const { pixelWeight = 0.6, colorWeight = 0.2, areaWeight = 0.15, severityWeight = 0.05 } = params;

  // Use content-only ratio when available
  const effectivePixelRatio = metrics.pixelDiffRatioContent ?? metrics.pixelDiffRatio;

  // Normalize each metric to 0-1 penalty range using thresholds
  const pixelPenalty = Math.min(effectivePixelRatio / thresholds.pixelDiffRatio, 1);
  const colorPenalty = Math.min(metrics.colorDeltaEAvg / thresholds.deltaE, 1);
  const areaPenalty = metrics.areaGap; // Already 0-1
  const severityPenalty = metrics.hasHighSeverity ? 1 : 0;

  // Calculate weighted penalty (0-100 scale)
  const totalPenalty =
    pixelPenalty * pixelWeight * 100 +
    colorPenalty * colorWeight * 100 +
    areaPenalty * areaWeight * 100 +
    severityPenalty * severityWeight * 100;

  // CQI = 100 - penalty
  return Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));
}

/**
 * Evaluate quality gate
 * @param result - Comparison result
 * @param styleDiffs - Style differences
 * @param thresholds - Quality gate thresholds
 * @param contentBasis - Content basis mode used
 * @param cqiParams - CQI calculation parameters
 * @param styleSummary - Style comparison summary with coverage info
 * @returns Quality gate result
 */
export function evaluateQualityGate(
  result: CompareImageResult,
  styleDiffs: StyleDiff[],
  thresholds: QualityGateThresholds,
  contentBasis: string = 'union',
  cqiParams?: CQIParams,
  styleSummary?: { coverage?: number }
): QualityGateResult {
  const hardGateViolations: HardGateViolation[] = [];
  const reasons: string[] = [];

  // Calculate area gap
  const areaGap = calculateAreaGap(result.dimensions.figma, result.dimensions.impl);

  // Hard Gate 1: Critical area gap (immediate fail)
  const areaGapCritical = thresholds.areaGapCritical ?? 0.15;
  if (areaGap > areaGapCritical) {
    hardGateViolations.push({
      type: 'area_gap',
      reason: `Area gap ${(areaGap * 100).toFixed(1)}% exceeds critical threshold ${(areaGapCritical * 100).toFixed(1)}%`,
      severity: 'critical',
    });
  }

  // Detect suspicions
  const suspicions = detectSuspicions(result, styleDiffs);
  if (suspicions.detected) {
    hardGateViolations.push({
      type: 'suspicion',
      reason: suspicions.reasons.join('; '),
      severity: 'high',
    });
  }

  // Check if re-evaluation is needed
  const reEvaluated = shouldReEvaluate(result, contentBasis);
  let originalMetrics: QualityGateResult['originalMetrics'];

  if (reEvaluated && result.pixelDiffRatioContent !== undefined) {
    originalMetrics = {
      pixelDiffRatioContent: result.pixelDiffRatioContent,
      contentBasis,
    };

    // Note: Actual re-evaluation would require re-running comparison with intersection basis
    // For now, we flag that re-evaluation is recommended
    hardGateViolations.push({
      type: 're_evaluation',
      reason:
        'Pad mode with union basis and high content coverage detected - intersection basis recommended',
      severity: 'high',
    });
  }

  // Hard Gate 2: High severity style issues
  const hasHighSeverity = styleDiffs.some((d) => d.severity === 'high');
  if (hasHighSeverity) {
    hardGateViolations.push({
      type: 'high_severity',
      reason: 'High severity style differences present',
      severity: 'high',
    });
  }

  // Calculate metrics for CQI
  const colorDeltaEAvg = result.colorDeltaEAvg ?? 0;
  const effectivePixelRatio = result.pixelDiffRatioContent ?? result.pixelDiffRatio;

  // Calculate CQI
  const cqi = calculateCQI(
    {
      pixelDiffRatioContent: result.pixelDiffRatioContent,
      pixelDiffRatio: result.pixelDiffRatio,
      colorDeltaEAvg,
      areaGap,
      hasHighSeverity,
    },
    thresholds,
    cqiParams
  );

  // Determine pass/fail
  let pass = hardGateViolations.length === 0;

  // Apply threshold checks (only if no hard gate violations)
  if (pass) {
    // Check style coverage if threshold is set
    if (
      styleSummary?.coverage !== undefined &&
      thresholds.minStyleCoverage !== undefined &&
      styleSummary.coverage < thresholds.minStyleCoverage
    ) {
      pass = false;
      reasons.push(
        `styleCoverage ${(styleSummary.coverage * 100).toFixed(1)}% < ${(thresholds.minStyleCoverage * 100).toFixed(0)}%`
      );
    }

    if (effectivePixelRatio > thresholds.pixelDiffRatio) {
      pass = false;
      const metricName = result.pixelDiffRatioContent ? 'pixelDiffRatioContent' : 'pixelDiffRatio';
      reasons.push(
        `${metricName} ${(effectivePixelRatio * 100).toFixed(2)}% > ${(thresholds.pixelDiffRatio * 100).toFixed(2)}%`
      );
    }

    if (colorDeltaEAvg > thresholds.deltaE) {
      pass = false;
      reasons.push(`colorDeltaEAvg ${colorDeltaEAvg.toFixed(2)} > ${thresholds.deltaE.toFixed(2)}`);
    }

    // Area gap warning (not critical, but adds to reasons)
    const areaGapWarning = thresholds.areaGapWarning ?? 0.05;
    if (areaGap > areaGapWarning) {
      reasons.push(
        `Area gap ${(areaGap * 100).toFixed(1)}% exceeds warning threshold ${(areaGapWarning * 100).toFixed(1)}%`
      );
    }
  } else {
    // Add hard gate violations to reasons
    for (const violation of hardGateViolations) {
      reasons.push(`[${violation.severity.toUpperCase()}] ${violation.reason}`);
    }
  }

  return {
    pass,
    cqi,
    hardGateViolations,
    suspicions,
    reEvaluated,
    originalMetrics,
    reasons,
    thresholds: {
      pixelDiffRatio: thresholds.pixelDiffRatio,
      deltaE: thresholds.deltaE,
    },
  };
}
