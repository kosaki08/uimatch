/**
 * Scoring utilities with violation_ratio, severity, and confidence separation
 * Provides robust tolerance calculation and deduplication key normalization
 */

export type Unit = 'px' | 'ΔE' | 'categorical';
export type Severity = 'low' | 'medium' | 'high';

export interface Issue {
  prop: string;
  expected: number | string;
  actual: number | string;
  unit: Unit;
  // Optional: pre-calculated if available
  delta?: number;
  tolerance?: number;
}

export interface ScoredIssue extends Issue {
  delta: number;
  tolerance: number;
  violation_ratio: number; // 0..1 (higher = worse)
  severity: Severity; // high = bad
  confidence: number; // 0..1 (higher = better)
  note: string;
}

const DEFAULTS = {
  scaleFactorByUnit: { px: 5, ΔE: 10, categorical: 1 } as Record<Unit, number>,
  toleranceFloor: { px: 1.0, ΔE: 0.5, categorical: 0 } as Record<Unit, number>,
  // px-based property-specific tolerance ratios (expected value * ratio)
  pxRatiosByProp: {
    gap: 0.1,
    'row-gap': 0.1,
    'column-gap': 0.1,
    padding: 0.15,
    'padding-top': 0.15,
    'padding-right': 0.15,
    'padding-bottom': 0.15,
    'padding-left': 0.15,
    margin: 0.15,
    'margin-top': 0.15,
    'margin-right': 0.15,
    'margin-bottom': 0.15,
    'margin-left': 0.15,
    width: 0.05,
    height: 0.05,
    'border-radius': 0.2,
    'border-top-left-radius': 0.2,
    'border-top-right-radius': 0.2,
    'border-bottom-left-radius': 0.2,
    'border-bottom-right-radius': 0.2,
    'font-size': 0.05,
  } as Record<string, number>,
  colorToleranceDE: 3.0,
} as const;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function toNumberPx(v: number | string): number {
  if (typeof v === 'number') return v;
  const m = String(v)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)(px)?$/i);
  return m && m[1] ? parseFloat(m[1]) : Number.NaN;
}

function deltaOf(issue: Issue): number {
  if (issue.unit === 'px') {
    const e = toNumberPx(issue.expected);
    const a = toNumberPx(issue.actual);
    return Math.abs(a - e);
  }
  if (issue.unit === 'ΔE') {
    // If delta is already provided as ΔE, use it
    if (typeof issue.delta === 'number') return Math.abs(issue.delta);
    // Fallback: numeric difference
    const e = Number(issue.expected);
    const a = Number(issue.actual);
    return Math.abs(a - e);
  }
  // categorical: mismatch = 1, match = 0
  return String(issue.expected).trim() === String(issue.actual).trim() ? 0 : 1;
}

function toleranceOf(issue: Issue): number {
  if (typeof issue.tolerance === 'number') {
    return Math.max(issue.tolerance, DEFAULTS.toleranceFloor[issue.unit]);
  }
  if (issue.unit === 'px') {
    const e = toNumberPx(issue.expected);
    const ratio = DEFAULTS.pxRatiosByProp[issue.prop] ?? 0.1; // default 10%
    const est = isNaN(e) ? DEFAULTS.toleranceFloor.px : Math.abs(e) * ratio;
    return Math.max(DEFAULTS.toleranceFloor.px, est);
  }
  if (issue.unit === 'ΔE') {
    return Math.max(DEFAULTS.toleranceFloor['ΔE'], DEFAULTS.colorToleranceDE);
  }
  // categorical
  return 1;
}

function severityFromRatio(r: number): Severity {
  if (r < 0.2) return 'low';
  if (r < 0.5) return 'medium';
  return 'high';
}

function formatNote(unit: Unit, tol: number, delta: number, ratio: number, issue: Issue): string {
  if (unit === 'categorical') {
    return `categorical mismatch: expected ${String(issue.expected)}, got ${String(issue.actual)}`;
  }
  const unitLabel = unit === 'px' ? 'px' : 'ΔE';
  const exceeds = delta.toFixed(unit === 'px' ? 1 : 1);
  const tolStr = tol.toFixed(unit === 'px' ? 1 : 1);
  const times = (delta / tol).toFixed(1);
  return `tol=±${tolStr}${unitLabel}, exceeds by ${exceeds}${unitLabel} (${times}×)`;
}

export function scoreIssue(issue: Issue): ScoredIssue {
  const delta = issue.delta ?? deltaOf(issue);
  const tolerance = toleranceOf(issue);
  const scale = DEFAULTS.scaleFactorByUnit[issue.unit];
  const ratioRaw = tolerance > 0 ? Math.abs(delta) / (tolerance * scale) : 1;
  const violation_ratio = clamp01(ratioRaw);
  const severity = severityFromRatio(violation_ratio);
  const confidence = clamp01(1 - violation_ratio); // Initial implementation: monotonic decrease

  return {
    ...issue,
    delta,
    tolerance,
    violation_ratio,
    severity,
    confidence,
    note: formatNote(issue.unit, tolerance, delta, violation_ratio, issue),
  };
}

/**
 * Canonicalize value for deduplication key (normalize px decimals, color strings, etc.)
 */
function canonicalizeValue(unit: Unit, v: number | string): string {
  if (unit === 'px') {
    const n = toNumberPx(v);
    return isNaN(n) ? String(v).trim() : `${n.toFixed(3)}px`; // 3 decimal places for stability
  }
  if (unit === 'ΔE') {
    const n = typeof v === 'number' ? v : Number(v);
    return isNaN(n) ? String(v).trim() : n.toFixed(2);
  }
  // categorical
  return String(v).trim().toLowerCase();
}

/**
 * Generate deduplication key from issue (prop|expected|actual with normalized values)
 */
export function dedupKey(issue: Issue): string {
  const exp = canonicalizeValue(issue.unit, issue.expected);
  const act = canonicalizeValue(issue.unit, issue.actual);
  return `${issue.prop}|${exp}|${act}`;
}
