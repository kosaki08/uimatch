/**
 * LLM-friendly output formatter for Claude Code
 * Transforms comparison results into actionable patch suggestions
 */

import type { StyleDiff } from 'uimatch-core';
import type { CompareResult } from '../types/index.js';

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

  const diffs: ComponentDiff[] = report.styleDiffs.map((diff) => {
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
        // Estimate normalized score (0-1) for confidence determination
        let normalizedScore = 0.5;
        if (propData.unit === 'px') {
          const expected = parseFloat(propData.expected) || 0;
          const delta = Math.abs(Number(propData.delta));
          normalizedScore = expected > 0 ? delta / (expected * 0.15) : 1; // 15% tolerance
        } else if (propData.unit === 'ΔE') {
          normalizedScore = Math.abs(Number(propData.delta)) / 3.0; // ΔE threshold
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
          note: generateNote(property, propData),
        };
      });

    return {
      selector: diff.selector,
      issues,
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
Apply minimal changes using CSS format.
${payload.preferTokens ? 'Prefer design tokens (CSS variables) when available.' : ''}

Output format:
1. Summary of changes
2. Patch code (CSS)
3. Risk assessment

Style differences:`;

  return `${instruction}\n\n${JSON.stringify(payload, null, 2)}`;
}
