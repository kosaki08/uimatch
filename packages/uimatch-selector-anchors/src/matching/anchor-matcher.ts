/**
 * Anchor matching logic for selecting the best anchor based on initialSelector hint
 */

import type { SelectorAnchor } from '../types/schema.js';

/**
 * Scoring result for anchor matching
 */
export interface AnchorScore {
  anchor: SelectorAnchor;
  score: number;
  reasons: string[];
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

  // Score each anchor based on various criteria
  for (const result of results) {
    const { anchor } = result;

    // 1. Last known selector exact match (highest priority)
    if (anchor.lastKnown?.selector === initialSelector) {
      result.score += 100;
      result.reasons.push('Exact match with last known selector');
    }

    // 2. Last known selector partial match
    if (anchor.lastKnown?.selector && initialSelector.includes(anchor.lastKnown.selector)) {
      result.score += 50;
      result.reasons.push('Partial match with last known selector');
    }

    // 3. Hint testid match
    if (anchor.hint?.testid && initialSelector.includes(`[data-testid="${anchor.hint.testid}"]`)) {
      result.score += 80;
      result.reasons.push('Matches testid hint');
    }

    // 4. Hint role match
    if (anchor.hint?.role && initialSelector.includes(`[role="${anchor.hint.role}"]`)) {
      result.score += 70;
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
        result.score += 30;
        result.reasons.push('Matches component metadata');
      }
    }

    // 6. Has snippet hash (better for tracking code movements)
    if (anchor.snippetHash) {
      result.score += 10;
      result.reasons.push('Has snippet hash for robust tracking');
    }

    // 7. Has recent last known selector
    if (anchor.lastKnown?.timestamp) {
      try {
        const timestamp = new Date(anchor.lastKnown.timestamp);
        const now = new Date();
        const daysSinceUpdate = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24);

        // Bonus for recent updates (within 30 days)
        if (daysSinceUpdate < 30) {
          result.score += 5;
          result.reasons.push('Recently verified selector');
        }
      } catch {
        // Invalid timestamp, skip scoring
      }
    }

    // 8. High stability score from last known
    if (anchor.lastKnown?.stabilityScore && anchor.lastKnown.stabilityScore >= 80) {
      result.score += 15;
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
