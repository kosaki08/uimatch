/**
 * LLM-friendly output formatter for Claude Code
 * Transforms comparison results into actionable patch suggestions
 */

import type { CompareResult } from '#plugin/types/index';
import { DEFAULT_TOLERANCES } from '#plugin/utils/style-score';
import type { StyleDiff } from 'uimatch-core';

/**
 * Confidence level for patch suggestions
 */
export type PatchConfidence = 'high' | 'medium' | 'low';

/**
 * Single style issue for LLM consumption
 */
export interface StyleIssue {
  prop: string;
  actual: string;
  expected: string;
  delta: number | string;
  unit: 'px' | 'ΔE' | 'categorical';
  severity: 'low' | 'medium' | 'high';
  suggest: string;
  confidence: PatchConfidence;
  note: string;
}

/**
 * Component diff grouped by selector
 */
export interface ComponentDiff {
  selector: string;
  issues: StyleIssue[];
}

/**
 * LLM-ready payload
 */
export interface LLMPayload {
  component: string;
  score: {
    SFS: number;
    DFS: number;
    high: number;
    medium: number;
    low: number;
  };
  preferTokens: boolean;
  diffs: ComponentDiff[];
}

/**
 * Determine confidence level based on property metadata
 */
function determineConfidence(
  property: string,
  propData: StyleDiff['properties'][string],
  normalizedScore: number
): PatchConfidence {
  // High confidence: token-based colors or very small deviations
  if (propData.expectedToken) {
    return 'high';
  }

  if (normalizedScore < 0.2) {
    return 'high';
  }

  if (normalizedScore < 0.5) {
    return 'medium';
  }

  return 'low';
}

/**
 * Generate CSS patch suggestion for a property
 */
function generateSuggestion(property: string, propData: StyleDiff['properties'][string]): string {
  // Guard against undefined expected value
  const expectedValue = propData.expected ?? '';

  // CSS suggestion
  return `${property}: ${expectedValue};`;
}

/**
 * Calculate tolerance for a given property based on expected value and unit
 */
function toleranceFor(
  property: string,
  expected: string | undefined,
  unit: 'px' | 'ΔE' | 'categorical'
): number | undefined {
  if (!expected) return undefined;

  // Color properties (strict match: ends with 'color')
  if (/(^|-)color$/.test(property)) {
    return DEFAULT_TOLERANCES.deltaE;
  }

  // box-shadow: handle both color (ΔE) and blur (px)
  if (property === 'box-shadow') {
    if (unit === 'ΔE') {
      return DEFAULT_TOLERANCES.deltaE + DEFAULT_TOLERANCES.shadowColorExtraDE;
    }
    if (unit === 'px') {
      const v = parseFloat(expected);
      return Number.isNaN(v) ? 1 : Math.max(1, v * DEFAULT_TOLERANCES.shadowBlur);
    }
  }

  // px-based tolerances (priority order matters)
  if (unit === 'px') {
    const v = parseFloat(expected);
    if (Number.isNaN(v)) return undefined;

    // Check border-width BEFORE general width|height
    if (/border.*width/.test(property)) {
      return Math.max(1, v * DEFAULT_TOLERANCES.borderWidth);
    }
    if (/gap/.test(property)) {
      return Math.max(1, v * DEFAULT_TOLERANCES.layoutGap);
    }
    if (/padding|margin/.test(property)) {
      return Math.max(1, v * DEFAULT_TOLERANCES.spacing);
    }
    if (/radius/.test(property)) {
      return Math.max(1, v * DEFAULT_TOLERANCES.radius);
    }
    if (/width|height/.test(property)) {
      return Math.max(1, v * DEFAULT_TOLERANCES.dimension);
    }
    if (property.includes('blur') || property.includes('shadow')) {
      return Math.max(1, v * DEFAULT_TOLERANCES.shadowBlur);
    }
  }

  return undefined;
}

/**
 * Generate note/rationale for the diff
 */
function generateNote(
  property: string,
  propData: StyleDiff['properties'][string],
  tolerance?: number
): string {
  const parts: string[] = [];

  if (propData.unit === 'px' && tolerance !== undefined) {
    parts.push(`tol=±${tolerance.toFixed(1)}px`);
  } else if (propData.unit === 'ΔE' && tolerance !== undefined) {
    parts.push(`tol=±${tolerance.toFixed(1)}ΔE`);
  }

  if (propData.expectedToken) {
    parts.push(`token: ${propData.expectedToken}`);
  }

  return parts.join(', ');
}

/**
 * Guess component name from report context
 */
function guessComponentName(report: CompareResult['report']): string {
  // Try to extract from first selector
  if (report.styleDiffs.length > 0) {
    const firstSelector = report.styleDiffs[0]?.selector;
    if (firstSelector) {
      // Extract data-testid if available
      const match = firstSelector.match(/data-testid="([^"]+)"/);
      if (match && match[1]) {
        return match[1]
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('');
      }

      // Extract class name
      const classMatch = firstSelector.match(/\.([a-zA-Z0-9_-]+)/);
      if (classMatch && classMatch[1]) {
        return classMatch[1]
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('');
      }
    }
  }

  return 'Component';
}

/**
 * Format comparison result for LLM consumption
 */
export function formatForLLM(
  result: CompareResult,
  options: { preferTokens?: boolean } = {}
): LLMPayload {
  const { preferTokens = true } = options;
  const { report } = result;

  const componentName = guessComponentName(report);

  const score = {
    SFS: report.styleSummary?.styleFidelityScore ?? 0,
    DFS: report.metrics.dfs,
    high: report.styleSummary?.highCount ?? 0,
    medium: report.styleSummary?.mediumCount ?? 0,
    low: report.styleSummary?.lowCount ?? 0,
  };

  // Group issues by selector (deduplicate) and apply tolerance-based scoring
  const grouped = new Map<string, StyleIssue[]>();

  for (const diff of report.styleDiffs) {
    // Type guard for complete property data
    type CompletePropertyData = Required<StyleDiff['properties'][string]>;

    const issues: StyleIssue[] = Object.entries(diff.properties)
      .filter((entry): entry is [string, CompletePropertyData] => {
        const [, propData] = entry;
        // Filter out entries with missing required fields
        return (
          propData.actual !== undefined &&
          propData.expected !== undefined &&
          propData.delta !== undefined &&
          propData.unit !== undefined
        );
      })
      .map(([property, propData]) => {
        // propData is now guaranteed to have all required fields
        const tol = toleranceFor(property, propData.expected, propData.unit as 'px' | 'ΔE' | 'categorical');

        // Calculate normalized score (0-1) using actual tolerances
        let normalizedScore = 0.5;
        if (propData.unit === 'px') {
          const delta = Math.abs(Number(propData.delta));
          const tolerance = tol ?? 1.0; // Fallback to 1px if no tolerance found
          normalizedScore = delta / tolerance;
        } else if (propData.unit === 'ΔE') {
          const delta = Math.abs(Number(propData.delta));
          const tolerance = tol ?? DEFAULT_TOLERANCES.deltaE;
          normalizedScore = delta / tolerance;
        }

        return {
          prop: property,
          actual: propData.actual,
          expected: propData.expected,
          delta: propData.delta,
          unit: propData.unit as StyleIssue['unit'],
          severity: diff.severity,
          suggest: generateSuggestion(property, propData),
          confidence: determineConfidence(property, propData, normalizedScore),
          note: generateNote(property, propData, tol),
        };
      });

    // Normalize selector (trim and collapse whitespace)
    const key = diff.selector.trim().replace(/\s+/g, ' ');
    const existing = grouped.get(key) ?? [];
    grouped.set(key, [...existing, ...issues]);
  }

  // Convert grouped map to array with deduplication and sorting
  const diffs: ComponentDiff[] = Array.from(grouped.entries()).map(([selector, issues]) => {
    // Deduplicate by property + expected + actual
    const seen = new Set<string>();
    const dedupedIssues = issues.filter((issue) => {
      const key = `${issue.prop}|${issue.expected}|${issue.actual}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by severity (high → medium → low), then by normalizedScore (descending)
    const severityOrder = { high: 0, medium: 1, low: 2 };
    dedupedIssues.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      // For same severity, sort by normalized score (higher delta first)
      // Since we don't have normalizedScore in the issue object, use delta as proxy
      const deltaA = typeof a.delta === 'number' ? Math.abs(a.delta) : 0;
      const deltaB = typeof b.delta === 'number' ? Math.abs(b.delta) : 0;
      return deltaB - deltaA;
    });

    return {
      selector,
      issues: dedupedIssues,
    };
  });

  return {
    component: componentName,
    score,
    preferTokens,
    diffs,
  };
}

/**
 * Generate LLM prompt with payload
 */
export function generateLLMPrompt(payload: LLMPayload): string {
  const instruction = `Fix the following style differences in the ${payload.component} component.

⚠️ USAGE GUIDELINES:
- CSS patches should be MINIMAL changes only (no restructuring or refactoring)
- When token is available, ALWAYS use token (CSS variable) instead of hard-coded value
${payload.preferTokens ? '- Prefer design tokens (CSS variables) when available.' : ''}

Output format:
1. Summary of changes
2. Patch code (CSS)
3. Risk assessment

Style differences:`;

  return `${instruction}\n\n${JSON.stringify(payload, null, 2)}`;
}
