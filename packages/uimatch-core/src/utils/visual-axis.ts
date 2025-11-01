import type { Axis, AxisAnalysisResult, ExpectedLayout, Rect } from '../types';

/**
 * Variance calculation for numerical array
 */
function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Sigmoid function for smooth confidence calculation
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Filter out noise elements (too small, duplicates)
 * This prevents decorative icons or absolutely positioned elements from affecting axis detection
 */
function robustRects(rects: Rect[]): Rect[] {
  const MIN_SIDE = 1;
  return rects
    .filter((r) => r.width >= MIN_SIDE && r.height >= MIN_SIDE)
    .filter(
      (r, i, arr) =>
        arr.findIndex(
          (x) => x.x === r.x && x.y === r.y && x.width === r.width && x.height === r.height
        ) === i
    );
}

/**
 * Infer visual axis from child element positions
 * Algorithm: Compare variance of center coordinates using continuous log-ratio judgment
 * - High log-ratio (> ln(1.7)) → horizontal layout
 * - Low log-ratio (< -ln(1.7)) → vertical layout
 * - Otherwise → ambiguous
 * Confidence increases smoothly with distance from threshold using sigmoid
 *
 * @param rects - Child element bounding boxes
 * @returns Inferred axis and confidence score
 */
export function inferVisualAxis(rects: Rect[]): { axis: Axis; confidence: number } {
  rects = robustRects(rects);
  if (rects.length < 2) {
    return { axis: 'ambiguous', confidence: 0 };
  }

  // Calculate center coordinates
  const cx = rects.map((r) => r.x + r.width / 2);
  const cy = rects.map((r) => r.y + r.height / 2);

  // Calculate variance in each direction
  const varX = variance(cx);
  const varY = variance(cy);

  // Avoid division by zero
  const epsilon = 1e-6;

  // Continuous judgment using log ratio
  // This provides smoother transition and better confidence calibration
  const logRatio = Math.log((varX + epsilon) / (varY + epsilon));
  const threshold = Math.log(1.7); // ≈ 0.53

  const margin = Math.abs(logRatio) - threshold;

  if (logRatio > threshold) {
    // Horizontal dominance - confidence increases with margin
    return { axis: 'horizontal', confidence: Math.min(0.95, 0.55 + sigmoid(margin)) };
  }

  if (logRatio < -threshold) {
    // Vertical dominance - confidence increases with margin
    return { axis: 'vertical', confidence: Math.min(0.95, 0.55 + sigmoid(-margin)) };
  }

  // Ambiguous zone - keep confidence moderate
  return { axis: 'ambiguous', confidence: 0.45 };
}

/**
 * Analyze layout axis by comparing declared mode with visual inference
 * Accepts both lowercase ('horizontal'|'vertical') and Figma format ('HORIZONTAL'|'VERTICAL'|'NONE')
 *
 * @param childRects - Child element bounding boxes
 * @param declaredMode - Layout mode declared in Figma (if available)
 * @returns Complete axis analysis result
 */
export function analyzeLayoutAxis(
  childRects: Rect[],
  declaredMode?: 'horizontal' | 'vertical' | 'HORIZONTAL' | 'VERTICAL' | 'NONE'
): AxisAnalysisResult {
  // Normalize declared mode to lowercase, ignore 'NONE'
  const normalizedDeclared =
    declaredMode && declaredMode !== 'NONE'
      ? (declaredMode.toLowerCase() as 'horizontal' | 'vertical')
      : undefined;

  const { axis: visualAxis, confidence } = inferVisualAxis(childRects);

  // Determine true axis based on policy:
  // 1. If declared and visual match → use that axis
  // 2. If mismatch → prioritize visual (reality over declaration)
  // 3. If ambiguous → keep as ambiguous with issue flag
  let trueAxis: Axis = visualAxis;
  let hasMismatch = false;
  const ambiguous = visualAxis === 'ambiguous';

  if (normalizedDeclared && visualAxis !== 'ambiguous') {
    hasMismatch = normalizedDeclared !== visualAxis;
    // Visual takes precedence over declared mode
    trueAxis = visualAxis;
  } else if (normalizedDeclared && visualAxis === 'ambiguous') {
    // If visual is ambiguous but we have a declaration, use it with lower confidence
    trueAxis = normalizedDeclared;
  }

  return {
    visualAxis,
    declaredMode: normalizedDeclared,
    trueAxis,
    confidence,
    hasMismatch,
    ambiguous,
  };
}

/**
 * Generate expected CSS layout specification based on axis analysis
 *
 * @param axisResult - Result from axis analysis
 * @param itemSpacing - Gap between items from Figma (in px)
 * @returns Expected CSS layout properties
 */
export function generateExpectedLayout(
  axisResult: AxisAnalysisResult,
  itemSpacing?: number
): ExpectedLayout {
  const { trueAxis } = axisResult;

  // Default to flex layout
  const layout: ExpectedLayout = {
    display: 'flex',
  };

  if (trueAxis === 'horizontal') {
    layout.flexDirection = 'row';
    layout.alignItems = 'center';
    if (itemSpacing !== undefined) {
      layout.gap = `${itemSpacing}px`;
    }
  } else if (trueAxis === 'vertical') {
    layout.flexDirection = 'column';
    if (itemSpacing !== undefined) {
      layout.gap = `${itemSpacing}px`;
    }
  }
  // For ambiguous, provide minimal flex layout without direction

  return layout;
}

/**
 * Normalize display property to handle inline-flex, inline-grid variants
 */
function normalizeDisplay(display: string): 'flex' | 'grid' | 'block' | 'inline' | 'other' {
  if (display === 'flex' || display === 'inline-flex') return 'flex';
  if (display.includes('grid')) return 'grid';
  if (display === 'block') return 'block';
  if (display === 'inline') return 'inline';
  return 'other';
}

/**
 * Extract axis from flex-direction (handles row-reverse, column-reverse)
 */
function axisFromFlexDirection(dir?: string | null): Axis {
  if (!dir) return 'ambiguous';
  if (dir.startsWith('row')) return 'horizontal';
  if (dir.startsWith('column')) return 'vertical';
  return 'ambiguous';
}

/**
 * Parse gap value to numeric pixels (handles 'px', 'rem', etc.)
 */
function parseGapValue(gap: string | undefined | null): number | null {
  if (!gap) return null;
  const match = gap.match(/^([\d.]+)px$/);
  return match && match[1] ? parseFloat(match[1]) : null;
}

/**
 * Partial computed style for layout mismatch checking
 * Allows passing POJO from Playwright evaluate() without full CSSStyleDeclaration
 */
export type PartialComputedStyle =
  | Pick<CSSStyleDeclaration, 'display' | 'flexDirection' | 'gridAutoFlow' | 'alignItems' | 'gap'>
  | {
      display?: string;
      flexDirection?: string;
      gridAutoFlow?: string;
      alignItems?: string;
      gap?: string;
    };

/**
 * Check if DOM layout matches expected layout based on axis
 * Returns severity of mismatch
 * Uses lenient checking for ambiguous or low-confidence axis detection
 *
 * @param computedStyle - Computed style from DOM element (full or partial)
 * @param expectedLayout - Expected layout from Figma analysis
 * @param opts - Optional axis analysis result for lenient checking
 * @returns Severity level ('none' | 'low' | 'medium' | 'high')
 */
export function checkLayoutMismatch(
  computedStyle: PartialComputedStyle,
  expectedLayout: ExpectedLayout,
  opts?: { axisResult?: AxisAnalysisResult }
): 'none' | 'low' | 'medium' | 'high' {
  // Normalize display values (inline-flex → flex, etc.)
  const display = normalizeDisplay(computedStyle.display || '');
  const flexDirection = computedStyle.flexDirection;
  const gridAutoFlow = computedStyle.gridAutoFlow;
  const alignItems = computedStyle.alignItems;
  const gap = computedStyle.gap;

  // Use lenient checking when axis analysis provided AND (axis is ambiguous OR confidence is low)
  const lenient =
    opts?.axisResult !== undefined &&
    (opts.axisResult.trueAxis === 'ambiguous' || opts.axisResult.confidence < 0.6);

  // Check display property mismatch
  if (display !== expectedLayout.display) {
    // flex vs grid mismatch is medium severity (low if lenient)
    return lenient ? 'low' : 'medium';
  }

  // Check flex direction for flex layouts
  if (display === 'flex' && expectedLayout.flexDirection) {
    const axisNow = axisFromFlexDirection(flexDirection);
    const axisExp = axisFromFlexDirection(expectedLayout.flexDirection);

    // Axis mismatch (row vs column) is critical
    if (axisNow !== axisExp) {
      return lenient ? 'medium' : 'high';
    }

    // Check for reverse direction mismatch (row vs row-reverse)
    const reverseMismatch =
      flexDirection?.includes('reverse') !== expectedLayout.flexDirection?.includes('reverse');
    if (reverseMismatch) {
      return 'medium';
    }

    // Check align-items
    if (expectedLayout.alignItems && alignItems && alignItems !== expectedLayout.alignItems) {
      return 'low';
    }

    // Check gap (allow ±2px tolerance)
    if (expectedLayout.gap && gap) {
      const gapExpected = parseGapValue(expectedLayout.gap);
      const gapActual = parseGapValue(gap);
      if (gapExpected !== null && gapActual !== null && Math.abs(gapExpected - gapActual) > 2) {
        return 'low';
      }
    }
  }

  // Check grid flow for grid layouts
  if (display === 'grid' && expectedLayout.gridAutoFlow) {
    // Extract first token from grid-auto-flow (handles 'row dense' → 'row')
    const flowNow = (gridAutoFlow || '').split(' ')[0];
    if (flowNow !== expectedLayout.gridAutoFlow) {
      return lenient ? 'medium' : 'high';
    }
  }

  return 'none';
}
