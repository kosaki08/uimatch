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
 * @param selector - CSS selector to tokenize
 * @returns Array of normalized tokens
 */
function tokenizeSelector(selector: string): string[] {
  const tokens: string[] = [];

  // Extract IDs: #myId -> myid
  const idMatches = selector.matchAll(/#([a-zA-Z0-9_-]+)/g);
  for (const match of idMatches) {
    if (match[1]) tokens.push(match[1].toLowerCase());
  }

  // Extract classes: .myClass -> myclass
  const classMatches = selector.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const match of classMatches) {
    if (match[1]) tokens.push(match[1].toLowerCase());
  }

  // Extract attributes: [data-testid="value"] -> datatestid, value
  const attrMatches = selector.matchAll(/\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]+)["']?)?\]/g);
  for (const match of attrMatches) {
    if (match[1]) tokens.push(match[1].replace(/-/g, '').toLowerCase());
    if (match[2]) tokens.push(match[2].toLowerCase());
  }

  // Extract tag names: button -> button
  const tagMatches = selector.matchAll(/\b([a-z][a-z0-9]*)\b/gi);
  for (const match of tagMatches) {
    const tag = match[1];
    if (!tag) continue;
    const tagLower = tag.toLowerCase();
    // Filter out common pseudo-classes/functions to avoid noise
    if (!['not', 'has', 'is', 'where', 'nth', 'first', 'last'].includes(tagLower)) {
      tokens.push(tagLower);
    }
  }

  return [...new Set(tokens)]; // Remove duplicates
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
