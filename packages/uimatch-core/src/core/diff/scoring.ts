/**
 * Priority scoring and patch hint generation
 */

import type { PatchHint } from '../../types/index';

/**
 * Calculate priority score for a style difference (0-100, higher = more important)
 * @param propDiffs Property-level differences
 * @param severity Overall severity
 * @param meta Element metadata
 * @returns Priority score
 */
export function calculatePriorityScore(
  propDiffs: Record<
    string,
    {
      actual?: string;
      expected?: string;
      expectedToken?: string;
      delta?: number;
      unit?: string;
    }
  >,
  severity: 'low' | 'medium' | 'high',
  meta?: {
    tag: string;
    id?: string;
    class?: string;
    testid?: string;
    cssSelector?: string;
    height?: number;
    elementKind?: 'text' | 'interactive' | 'container';
  }
): number {
  let score = 0;

  // 1. Layout impact (40 points max) - highest priority
  const layoutProps = [
    'display',
    'flex-direction',
    'align-items',
    'justify-content',
    'gap',
    'padding-top',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'width',
    'height',
  ];
  // Only count properties with actual differences (delta exists or actual !== expected)
  const layoutDiffs = Object.keys(propDiffs).filter((p) => {
    if (!layoutProps.includes(p)) return false;
    const diff = propDiffs[p];
    if (!diff) return false;
    // Has difference if delta is non-zero or actual !== expected
    const hasDelta = diff.delta !== undefined && diff.delta !== 0;
    const valuesDiffer =
      diff.actual !== undefined && diff.expected !== undefined && diff.actual !== diff.expected;
    return hasDelta || valuesDiffer;
  });
  if (layoutDiffs.length > 0) {
    score += 20 + Math.min(layoutDiffs.length * 5, 20); // 20-40 points
  }

  // 2. Element prominence (25 points max) - size and tag importance
  if (meta) {
    // Interactive elements (button, a, input) are more critical for visual accuracy
    const isInteractive =
      meta.elementKind === 'interactive' ||
      ['button', 'a', 'input'].includes(meta.tag.toLowerCase());

    // Tag importance: h1-h6, button, a > div, span
    const prominentTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'a'];
    if (prominentTags.includes(meta.tag.toLowerCase())) {
      score += 10;
    }

    // Interactive elements with background-color differences get higher priority
    if (isInteractive && propDiffs['background-color']) {
      const bgDiff = propDiffs['background-color'];
      const hasDelta = bgDiff.delta !== undefined && bgDiff.delta !== 0;
      const valuesDiffer =
        bgDiff.actual !== undefined &&
        bgDiff.expected !== undefined &&
        bgDiff.actual !== bgDiff.expected;
      if (hasDelta || valuesDiffer) {
        score += 15; // Boost interactive element background diffs
      }
    }

    // Size-based prominence (larger elements are more noticeable)
    if (meta.height !== undefined) {
      if (meta.height > 100)
        score += 10; // Large element
      else if (meta.height > 50) score += 5; // Medium element
    }

    // Font size prominence
    const fontSize = propDiffs['font-size'];
    if (fontSize?.actual) {
      const size = parseFloat(fontSize.actual);
      if (size > 24) score += 5; // Large text
    }
  }

  // 3. Token usage (20 points max) - token diffs are easy to fix and maintain consistency
  // Only count properties with actual differences that have tokens
  const tokenDiffs = Object.values(propDiffs).filter((d) => {
    if (!d || !d.expectedToken) return false;
    // Has difference if delta is non-zero or actual !== expected
    const hasDelta = d.delta !== undefined && d.delta !== 0;
    const valuesDiffer =
      d.actual !== undefined && d.expected !== undefined && d.actual !== d.expected;
    return hasDelta || valuesDiffer;
  }).length;
  if (tokenDiffs > 0) {
    score += 10 + Math.min(tokenDiffs * 5, 10); // 10-20 points
  }

  // 4. Severity multiplier (15 points max)
  const severityScore = { low: 5, medium: 10, high: 15 };
  score += severityScore[severity];

  return Math.min(100, Math.round(score));
}

/**
 * Generate patch hints for style differences
 * @param propDiffs Property-level differences
 * @returns Array of patch hints
 */
export function generatePatchHints(
  propDiffs: Record<
    string,
    {
      actual?: string;
      expected?: string;
      expectedToken?: string;
      delta?: number;
      unit?: string;
    }
  >
): PatchHint[] {
  const hints: PatchHint[] = [];

  for (const [prop, diff] of Object.entries(propDiffs)) {
    // Exclude auxiliary properties from patch hints
    if (prop.startsWith('box-shadow-offset-')) continue;
    // Include diffs with expected value, even if delta is null (e.g., categorical mismatches without delta initially)
    // or if actual differs from expected
    if (!diff.expected || (diff.delta == null && diff.actual === diff.expected)) continue;

    // Determine severity based on delta and unit
    let severity: 'low' | 'medium' | 'high' = 'low';
    if (diff.unit === 'ΔE' && diff.delta != null) {
      if (diff.delta > 6) severity = 'high';
      else if (diff.delta > 3) severity = 'medium';
    } else if (diff.unit === 'px' && diff.delta != null) {
      if (Math.abs(diff.delta) > 4) severity = 'medium';
      if (Math.abs(diff.delta) > 8) severity = 'high';
    } else if (diff.unit === 'categorical' && diff.delta === 1) {
      // Categorical mismatches (display, flex-direction, align-items, etc.) are high severity for layout
      if (['display', 'flex-direction', 'align-items', 'justify-content'].includes(prop)) {
        severity = 'high';
      } else {
        severity = 'medium';
      }
    }

    // Determine suggested value (prefer token for colors)
    let suggestedValue = diff.expected;
    if (diff.expectedToken && ['color', 'background-color', 'border-color'].includes(prop)) {
      suggestedValue = `var(${diff.expectedToken})`;
    }

    hints.push({
      property: prop,
      suggestedValue,
      severity,
    });
  }

  return hints;
}
