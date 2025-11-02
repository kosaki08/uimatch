/**
 * Anchor matching logic for selecting the best anchor based on initialSelector hint
 */

import type { SelectorAnchor } from '../types/schema.js';
import { getAnchorMatchingConfig } from '../types/weights.js';

/**
 * Scoring result for anchor matching
 */
export interface AnchorScore {
  anchor: SelectorAnchor;
  score: number;
  reasons: string[];
}

/**
 * Normalize selector for comparison
 * - Removes extra whitespace
 * - Normalizes quotes (double -> single)
 * - Basic format standardization
 */
function normalizeSelector(selector: string): string {
  return selector
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/"/g, "'"); // Normalize quotes
}

/**
 * Check if selector contains testid in various formats
 * Handles both [data-testid="value"] and testid:value formats
 */
function hasTestId(selector: string, testid: string): boolean {
  const normalized = normalizeSelector(selector);
  return (
    normalized.includes(`testid:${testid}`) ||
    normalized.includes(`[data-testid='${testid}']`) ||
    normalized.includes(`data-testid='${testid}'`)
  );
}

/**
 * Check if selector contains role in various formats
 * Handles both [role="value"] and role:value formats
 */
function hasRole(selector: string, role: string): boolean {
  const normalized = normalizeSelector(selector);
  return (
    normalized.includes(`role:${role}`) ||
    normalized.includes(`[role='${role}']`) ||
    normalized.includes(`role='${role}'`)
  );
}

/**
 * Match anchors against initial selector hint
 * Returns anchors sorted by relevance score (highest first)
 *
 * @param anchors - Array of available anchors
 * @param initialSelector - Initial selector provided by user
 * @returns Sorted array of anchors with scores
 */
export function matchAnchors(anchors: SelectorAnchor[], initialSelector: string): AnchorScore[] {
  const results: AnchorScore[] = anchors.map((anchor) => ({
    anchor,
    score: 0,
    reasons: [],
  }));

  // Load scoring weights from external configuration
  const config = getAnchorMatchingConfig();
  const { weights, thresholds } = config;

  // Normalize initial selector once for all comparisons
  const normalizedInitial = normalizeSelector(initialSelector);

  // Score each anchor based on various criteria
  for (const result of results) {
    const { anchor } = result;

    // 1. Last known selector exact match (highest priority)
    if (anchor.lastKnown?.selector) {
      const normalizedLast = normalizeSelector(anchor.lastKnown.selector);

      if (normalizedLast === normalizedInitial) {
        result.score += weights.exactLastKnownMatch;
        result.reasons.push('Exact match with last known selector');
      }
      // 2. Last known selector bidirectional partial match
      else if (
        normalizedInitial.includes(normalizedLast) ||
        normalizedLast.includes(normalizedInitial)
      ) {
        result.score += weights.partialLastKnownMatch;
        result.reasons.push('Partial match with last known selector');
      }
    }

    // 3. Hint testid match with format flexibility
    if (anchor.hint?.testid && hasTestId(initialSelector, anchor.hint.testid)) {
      result.score += weights.testidHintMatch;
      result.reasons.push('Matches testid hint');
    }

    // 4. Hint role match with format flexibility
    if (anchor.hint?.role && hasRole(initialSelector, anchor.hint.role)) {
      result.score += weights.roleHintMatch;
      result.reasons.push('Matches role hint');
    }

    // 5. Component metadata match
    if (anchor.meta?.component) {
      const componentLower = anchor.meta.component.toLowerCase();
      const selectorLower = initialSelector.toLowerCase();

      // Normalize both for comparison (remove hyphens and underscores)
      const componentNormalized = componentLower.replace(/[-_]/g, '');
      const selectorNormalized = selectorLower.replace(/[-_]/g, '');

      if (selectorNormalized.includes(componentNormalized)) {
        result.score += weights.componentMetadataMatch;
        result.reasons.push('Matches component metadata');
      }
    }

    // 6. Has snippet hash (better for tracking code movements)
    if (anchor.snippetHash) {
      result.score += weights.hasSnippetHash;
      result.reasons.push('Has snippet hash for robust tracking');
    }

    // 7. Has recent last known selector
    if (anchor.lastKnown?.timestamp) {
      try {
        const timestamp = new Date(anchor.lastKnown.timestamp);
        const now = new Date();
        const daysSinceUpdate = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24);

        // Bonus for recent updates (configurable threshold)
        if (daysSinceUpdate < thresholds.recentUpdateDays) {
          result.score += weights.recentUpdate;
          result.reasons.push('Recently verified selector');
        }
      } catch {
        // Invalid timestamp, skip scoring
      }
    }

    // 8. High stability score from last known
    if (
      anchor.lastKnown?.stabilityScore &&
      anchor.lastKnown.stabilityScore >= thresholds.highStabilityScore
    ) {
      result.score += weights.highStability;
      result.reasons.push('High stability score from previous resolution');
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Select the best anchor from a list based on initial selector
 * Returns null if no good match found
 *
 * @param anchors - Array of available anchors
 * @param initialSelector - Initial selector provided by user
 * @param minScore - Minimum score threshold (default: 0, meaning return best available)
 * @returns Best matching anchor or null
 */
export function selectBestAnchor(
  anchors: SelectorAnchor[],
  initialSelector: string,
  minScore = 0
): AnchorScore | null {
  if (anchors.length === 0) {
    return null;
  }

  const scored = matchAnchors(anchors, initialSelector);
  const best = scored[0];

  if (!best || best.score < minScore) {
    return null;
  }

  return best;
}
