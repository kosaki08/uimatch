/**
 * LLM-friendly output formatter for Claude Code
 * Transforms comparison results into actionable patch suggestions
 */

import type { CompareResult } from '#plugin/types/index';
import { scoreIssue, dedupKey, type Issue, type ScoredIssue } from '#plugin/utils/scoring';
import type { StyleDiff } from 'uimatch-core';

/**
 * Confidence level for patch suggestions (compatibility with existing code)
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
  violation_ratio?: number; // New: violation ratio (0-1, higher = worse)
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
 * Generate CSS patch suggestion for a property
 */
function generateSuggestion(property: string, propData: StyleDiff['properties'][string]): string {
  // Guard against undefined expected value
  const expectedValue = propData.expected ?? '';

  // CSS suggestion
  return `${property}: ${expectedValue};`;
}

/**
 * Convert scored issue to StyleIssue format with token info
 */
function toStyleIssue(scored: ScoredIssue, propData: StyleDiff['properties'][string]): StyleIssue {
  // Add token info to note if available
  let note = scored.note;
  if (propData.expectedToken) {
    note = `${note}, token: ${propData.expectedToken}`;
  }

  // Map confidence (0-1, higher=better) to PatchConfidence
  let confidence: PatchConfidence;
  if (propData.expectedToken || scored.confidence >= 0.8) {
    confidence = 'high';
  } else if (scored.confidence >= 0.5) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    prop: scored.prop,
    actual: String(scored.actual),
    expected: String(scored.expected),
    delta: scored.delta,
    unit: scored.unit,
    severity: scored.severity,
    suggest: generateSuggestion(scored.prop, propData),
    confidence,
    note,
    violation_ratio: scored.violation_ratio,
  };
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
        // Create Issue for scoring
        const issue: Issue = {
          prop: property,
          expected: propData.expected,
          actual: propData.actual,
          unit: propData.unit as 'px' | 'ΔE' | 'categorical',
          delta: typeof propData.delta === 'number' ? propData.delta : undefined,
        };

        // Score the issue using new scoring system
        const scored = scoreIssue(issue);

        // Convert to StyleIssue with token info
        return toStyleIssue(scored, propData);
      });

    // Normalize selector (trim and collapse whitespace)
    const key = diff.selector.trim().replace(/\s+/g, ' ');
    const existing = grouped.get(key) ?? [];
    grouped.set(key, [...existing, ...issues]);
  }

  // Convert grouped map to array with deduplication and sorting
  const diffs: ComponentDiff[] = Array.from(grouped.entries()).map(([selector, issues]) => {
    // Deduplicate by normalized property + expected + actual (using dedupKey)
    const seen = new Set<string>();
    const dedupedIssues = issues.filter((issue) => {
      const key = dedupKey({
        prop: issue.prop,
        expected: issue.expected,
        actual: issue.actual,
        unit: issue.unit,
      });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by severity (high → medium → low), then by |delta| (descending)
    const severityOrder = { high: 0, medium: 1, low: 2 };
    dedupedIssues.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      // For same severity, sort by delta (higher delta first)
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
