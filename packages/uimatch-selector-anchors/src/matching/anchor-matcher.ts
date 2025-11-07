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
  const s = normalizeSelector(selector);
  // testid:foo (exact match) - allows general symbols except whitespace and brackets
  const m1 = s.match(/^testid:([^\s[\]]+)$/);
  if (m1?.[1] === testid) return true;
  // [data-testid="foo"] / [data-testid='foo'] (exact match)
  const re = /\[data-testid=(?:"([^"]+)"|'([^']+)')\]/g;
  for (let m; (m = re.exec(s)); ) {
    if ((m[1] ?? m[2]) === testid) return true;
  }
  return false;
}

/**
 * Check if selector contains role in various formats
 * Handles both [role="value"] and role:value formats
 * Case-insensitive comparison for robustness
 */
function hasRole(selector: string, role: string): boolean {
  const s = normalizeSelector(selector).toLowerCase();
  const r = role.toLowerCase();
  // role:button[...] (exact match of role prefix)
  const p = s.match(/^role:([a-z0-9_-]+)/);
  if (p?.[1] === r) return true;
  // [role="button"] / [role='button'] only (no partial match)
  const re = /\[role=(?:"([^"]+)"|'([^']+)')\]/g;
  for (let m; (m = re.exec(s)); ) {
    if ((m[1] ?? m[2]) === r) return true;
  }
  return false;
}

/**
 * Tokenize a CSS selector into meaningful components
 * Extracts: IDs (#id), classes (.class), attributes ([attr]), tags (tag)
 * Note: Attribute values are excluded to prevent false positives
 * @param selector - CSS selector to tokenize
 * @returns Array of normalized tokens
 */
function tokenizeSelector(selector: string): string[] {
  const tokens: string[] = [];

  // Remove attribute selectors entirely to avoid including attribute values
  // e.g., [href="#foo"] won't pollute tokens with "foo"
  const selectorWithoutAttrs = selector.replace(/\[[^\]]*\]/g, '');

  // Extract IDs: #myId -> myid
  const idMatches = selectorWithoutAttrs.matchAll(/#([a-zA-Z0-9_-]+)/g);
  for (const match of idMatches) {
    if (match[1]) tokens.push(match[1].toLowerCase());
  }

  // Extract classes: .myClass -> myclass
  const classMatches = selectorWithoutAttrs.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const match of classMatches) {
    if (match[1]) tokens.push(match[1].toLowerCase());
  }

  // Extract tag names: button -> button (excluding generic HTML tags to reduce false positives)
  const tagMatches = selectorWithoutAttrs.matchAll(/\b([a-z][a-z0-9]*)\b/gi);
  const PSEUDO_CLASSES = ['not', 'has', 'is', 'where', 'nth', 'first', 'last'];
  const GENERIC_TAGS = [
    'div',
    'span',
    'p',
    'li',
    'ul',
    'ol',
    'section',
    'article',
    'main',
    'nav',
    'header',
    'footer',
  ];

  for (const match of tagMatches) {
    const tag = match[1];
    if (!tag) continue;
    const tagLower = tag.toLowerCase();
    // Filter out pseudo-classes and generic HTML tags
    if (!PSEUDO_CLASSES.includes(tagLower) && !GENERIC_TAGS.includes(tagLower)) {
      tokens.push(tagLower);
    }
  }

  return [...new Set(tokens)]; // Remove duplicates
}

/**
 * Calculate Jaccard coefficient between two token sets
 * @param tokens1 - First set of tokens
 * @param tokens2 - Second set of tokens
 * @returns Jaccard coefficient (0-1)
 */
function jaccardCoefficient(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 && tokens2.length === 0) return 1.0;
  if (tokens1.length === 0 || tokens2.length === 0) return 0.0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Check if component name matches any selector token
 * Uses token-level matching to reduce false positives
 * @param selector - CSS selector to check
 * @param componentName - Component name (PascalCase/camelCase)
 * @returns true if component name matches a selector token
 */
function matchesComponentTokenized(selector: string, componentName: string): boolean {
  const tokens = tokenizeSelector(selector);

  // Convert component name to kebab-case and normalized forms
  const toKebab = (str: string) => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const kebab = toKebab(componentName);
  const normalized = kebab.replace(/-/g, '');

  // Check for exact token match (kebab-case or normalized)
  return tokens.includes(kebab) || tokens.includes(normalized);
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
  const { weights } = config;

  // Score each anchor based on various criteria
  for (const result of results) {
    const { anchor } = result;

    // 0. lastKnown/resolvedCss selector match (highest priority)
    const lastSelector = anchor.lastKnown?.selector || anchor.resolvedCss;
    if (lastSelector) {
      const s0 = normalizeSelector(initialSelector);
      const s1 = normalizeSelector(lastSelector);
      if (s0 === s1) {
        result.score += weights.exactLastKnownMatch;
        result.reasons.push('Matches lastKnown/resolvedCss (exact)');
      } else if (s0.includes(s1) || s1.includes(s0)) {
        result.score += weights.partialLastKnownMatch;
        result.reasons.push('Matches lastKnown/resolvedCss (partial)');
      } else {
        // Tokenized fuzzy matching using Jaccard coefficient
        const tokens0 = tokenizeSelector(s0);
        const tokens1 = tokenizeSelector(s1);
        const jaccard = jaccardCoefficient(tokens0, tokens1);
        // Apply partial score if Jaccard coefficient > 0.66 (2/3 threshold)
        if (jaccard > 0.66) {
          const fuzzyScore = Math.round(weights.partialLastKnownMatch * jaccard);
          result.score += fuzzyScore;
          result.reasons.push(
            `Matches lastKnown/resolvedCss (tokenized fuzzy, Jaccard: ${jaccard.toFixed(2)})`
          );
        }
      }
    }

    // 0.1. Recent update bonus (recency)
    if (anchor.lastSeen) {
      const days = (Date.now() - Date.parse(anchor.lastSeen)) / 86400000;
      if (days <= config.thresholds.recentUpdateDays) {
        result.score += weights.recentUpdate;
        result.reasons.push(`Recently seen alive (${Math.round(days)} days ago)`);
      }
    }

    // 0.2. High stability bonus
    if (
      anchor.lastKnown?.stabilityScore &&
      anchor.lastKnown.stabilityScore >= config.thresholds.highStabilityScore
    ) {
      result.score += weights.highStability;
      result.reasons.push(
        `Historically high stability (${anchor.lastKnown.stabilityScore}% score)`
      );
    }

    // 1. Hint testid match with format flexibility
    if (anchor.hint?.testid && hasTestId(initialSelector, anchor.hint.testid)) {
      result.score += weights.testidHintMatch;
      result.reasons.push('Matches testid hint');
    }

    // 2. Hint role match with format flexibility
    if (anchor.hint?.role && hasRole(initialSelector, anchor.hint.role)) {
      result.score += weights.roleHintMatch;
      result.reasons.push('Matches role hint');
    }

    // 3. Component metadata match (token-level to reduce false positives)
    if (anchor.meta?.component) {
      const componentName = anchor.meta.component;

      // Only apply bonus if component name is long enough (≥3 chars)
      // Short names like "ui", "app", etc. cause false positives
      if (componentName.length >= 3) {
        // Use token-level matching for higher precision
        if (matchesComponentTokenized(initialSelector, componentName)) {
          result.score += weights.componentMetadataMatch;
          result.reasons.push('Matches component metadata (token-level)');
        }
      }
    }

    // 4. Has snippet hash (better for tracking code movements)
    if (anchor.snippetHash) {
      result.score += weights.hasSnippetHash;
      result.reasons.push('Has snippet hash for robust tracking');
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
