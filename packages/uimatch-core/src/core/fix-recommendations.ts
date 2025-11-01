/**
 * Fix recommendation generation for style differences
 * Generates prioritized fix suggestions for LLM consumption
 */

import type { StyleDiff } from '../types/index';

/**
 * Top fix recommendation with estimated impact
 */
export interface FixRecommendation {
  /** Priority rank (1 = highest) */
  rank: number;
  /** Element selector */
  selector: string;
  /** Properties to fix */
  fixes: Array<{
    property: string;
    current: string;
    suggested: string;
    isToken: boolean;
  }>;
  /** Priority score (0-100) */
  priorityScore: number;
  /** Estimated DFS improvement if fixed */
  estimatedImpact: string;
  /** Reason for prioritization */
  reason: string;
}

/**
 * Generate top N fix recommendations from style differences
 * @param diffs Style differences (assumed to be sorted by priority)
 * @param maxRecommendations Maximum number of recommendations to generate
 * @returns Array of fix recommendations
 */
export function generateFixRecommendations(
  diffs: StyleDiff[],
  maxRecommendations: number = 5
): FixRecommendation[] {
  const recommendations: FixRecommendation[] = [];

  // Take top N diffs by priority score
  const topDiffs = diffs.slice(0, Math.min(maxRecommendations, diffs.length));

  for (let i = 0; i < topDiffs.length; i++) {
    const diff = topDiffs[i];
    if (!diff) continue;

    const fixes =
      diff.patchHints?.map((hint) => {
        const propDiff = diff.properties[hint.property];
        return {
          property: hint.property,
          current: propDiff?.actual ?? 'unknown',
          suggested: hint.suggestedValue,
          isToken: !!propDiff?.expectedToken,
        };
      }) ?? [];

    // Generate reason based on priority factors
    const reason = generateReason(diff);

    // Estimate impact based on priority score and severity
    const estimatedImpact = estimateImpact(diff.priorityScore ?? 0, diff.severity);

    recommendations.push({
      rank: i + 1,
      selector: diff.selector,
      fixes,
      priorityScore: diff.priorityScore ?? 0,
      estimatedImpact,
      reason,
    });
  }

  return recommendations;
}

/**
 * Generate reason for prioritization
 * @param diff Style difference
 * @returns Human-readable reason
 */
function generateReason(diff: StyleDiff): string {
  const reasons: string[] = [];

  // Check for layout impact
  const layoutProps = [
    'display',
    'flex-direction',
    'align-items',
    'justify-content',
    'gap',
    'padding',
    'width',
    'height',
  ];
  const hasLayoutImpact = Object.keys(diff.properties).some((p) =>
    layoutProps.some((lp) => p.startsWith(lp))
  );
  if (hasLayoutImpact) {
    reasons.push('layout-critical');
  }

  // Check for prominent element
  if (diff.meta) {
    const prominentTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'a'];
    if (prominentTags.includes(diff.meta.tag.toLowerCase())) {
      reasons.push('prominent-element');
    }
    if (diff.meta.height && diff.meta.height > 100) {
      reasons.push('large-element');
    }
  }

  // Check for token opportunities
  const hasTokenDiffs = Object.values(diff.properties).some((p) => p.expectedToken);
  if (hasTokenDiffs) {
    reasons.push('token-opportunity');
  }

  // Check severity
  if (diff.severity === 'high') {
    reasons.push('high-severity');
  }

  return reasons.length > 0 ? reasons.join(', ') : 'general-improvement';
}

/**
 * Estimate DFS impact of fixing this difference
 * @param priorityScore Priority score (0-100)
 * @param severity Severity level
 * @returns Impact description
 */
function estimateImpact(priorityScore: number, severity: 'low' | 'medium' | 'high'): string {
  const severityMultiplier = { low: 1, medium: 1.5, high: 2 };
  const estimatedPoints = (priorityScore / 100) * 10 * severityMultiplier[severity];

  if (estimatedPoints >= 10) return 'High (+10-15 DFS points)';
  if (estimatedPoints >= 5) return 'Medium (+5-10 DFS points)';
  return 'Low (+1-5 DFS points)';
}

/**
 * Format fix recommendations as markdown for LLM consumption
 * @param recommendations Fix recommendations
 * @returns Markdown-formatted string
 */
export function formatRecommendationsAsMarkdown(recommendations: FixRecommendation[]): string {
  if (recommendations.length === 0) {
    return '## ✅ No critical fixes needed\n\nAll style differences are within acceptable thresholds.';
  }

  let markdown = '## 🎯 Priority Fix Recommendations\n\n';
  markdown += '_Ordered by impact - fix these in sequence for maximum DFS improvement_\n\n';

  for (const rec of recommendations) {
    markdown += `### ${rec.rank}. \`${rec.selector}\` (Priority: ${rec.priorityScore}/100)\n\n`;
    markdown += `**Estimated Impact**: ${rec.estimatedImpact}\n`;
    markdown += `**Reason**: ${rec.reason}\n\n`;
    markdown += '**Fixes**:\n';

    for (const fix of rec.fixes) {
      const tokenBadge = fix.isToken ? ' 🎨 _token_' : '';
      markdown += `- \`${fix.property}\`: \`${fix.current}\` → \`${fix.suggested}\`${tokenBadge}\n`;
    }

    markdown += '\n';
  }

  // Add cumulative impact estimate
  const totalImpact = recommendations.reduce((sum, rec) => {
    const match = rec.estimatedImpact.match(/\+(\d+)-(\d+)/);
    return sum + (match?.[1] ? parseInt(match[1], 10) : 0);
  }, 0);

  markdown += `---\n\n**Total Estimated DFS Improvement**: +${totalImpact}+ points if all fixes applied\n`;

  return markdown;
}
