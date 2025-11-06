/**
 * Fallback selector generation using role/text/class strategies
 * When source-based resolution fails, use these strategies to find the element
 */

import type { Fallbacks, Hints } from '../types/schema.js';

/**
 * Result of fallback selector generation
 */
export interface FallbackSelectorResult {
  /** Generated selector candidates */
  selectors: string[];
  /** Explanation of the strategy used */
  reasons: string[];
}

/**
 * Generate fallback selectors from fallback strategies
 * Combines role, text, classes, and tag to create selector candidates
 *
 * @param fallbacks - Fallback strategies from anchor definition
 * @param hints - Additional hints from AST extraction (optional)
 * @returns Fallback selector candidates
 */
export function generateFallbackSelectors(
  fallbacks: Fallbacks,
  hints?: Hints
): FallbackSelectorResult {
  const selectorSet = new Set<string>();
  const reasons: string[] = [];

  // Merge fallbacks with hints (fallbacks take precedence)
  const effectiveRole = fallbacks.role ?? hints?.role;
  const effectiveText = fallbacks.text ?? hints?.text;
  const effectiveClasses = fallbacks.classList ?? hints?.classList;
  const effectiveTag = fallbacks.tag ?? hints?.tag;

  // Strategy 1: Role-based selectors
  if (effectiveRole) {
    // Simple role selector
    selectorSet.add(`[role="${effectiveRole}"]`);
    reasons.push(`Using role="${effectiveRole}"`);

    // Role + text combination (most specific)
    if (effectiveText) {
      selectorSet.add(`[role="${effectiveRole}"]:has-text("${escapeText(effectiveText)}")`);
      reasons.push(`Combining role with text content`);
    }

    // Role + classes
    if (effectiveClasses && effectiveClasses.length > 0) {
      const classSelector = effectiveClasses.map((c) => `.${c}`).join('');
      selectorSet.add(`[role="${effectiveRole}"]${classSelector}`);
      reasons.push(`Combining role with CSS classes`);
    }
  }

  // Strategy 2: Text-based selectors
  if (effectiveText) {
    const escapedText = escapeText(effectiveText);

    // Text-only (least specific, but works if text is unique)
    selectorSet.add(`:has-text("${escapedText}")`);
    reasons.push('Using text content');

    // Tag + text
    if (effectiveTag) {
      selectorSet.add(`${effectiveTag}:has-text("${escapedText}")`);
      reasons.push('Combining tag with text content');

      // Tag + classes + text (most specific without role)
      if (effectiveClasses && effectiveClasses.length > 0) {
        const classSelector = effectiveClasses.map((c) => `.${c}`).join('');
        selectorSet.add(`${effectiveTag}${classSelector}:has-text("${escapedText}")`);
        reasons.push('Combining tag, classes, and text');
      }
    }
  }

  // Strategy 3: Class-based selectors
  if (effectiveClasses && effectiveClasses.length > 0) {
    const classSelector = effectiveClasses.map((c) => `.${c}`).join('');

    // Classes only
    selectorSet.add(classSelector);
    reasons.push(`Using CSS classes: ${effectiveClasses.join(', ')}`);

    // Tag + classes
    if (effectiveTag) {
      selectorSet.add(`${effectiveTag}${classSelector}`);
      reasons.push('Combining tag with CSS classes');
    }
  }

  // Strategy 4: Landmark-based context selectors
  // Try to use parent landmarks (article, section, nav, main, aside) for better specificity
  if (effectiveTag || effectiveClasses || effectiveRole) {
    const landmarks = ['article', 'section', 'nav', 'main', 'aside', 'header', 'footer'];

    for (const landmark of landmarks) {
      // Landmark > role
      if (effectiveRole) {
        selectorSet.add(`${landmark} [role="${effectiveRole}"]`);
      }

      // Landmark > tag.classes
      if (effectiveTag && effectiveClasses && effectiveClasses.length > 0) {
        const classSelector = effectiveClasses.map((c) => `.${c}`).join('');
        selectorSet.add(`${landmark} ${effectiveTag}${classSelector}`);
      }

      // Landmark > classes
      if (effectiveClasses && effectiveClasses.length > 0 && !effectiveTag) {
        const classSelector = effectiveClasses.map((c) => `.${c}`).join('');
        selectorSet.add(`${landmark} ${classSelector}`);
      }
    }

    reasons.push('Generated landmark-based context selectors');
  }

  // Apply deduplication and limit
  const MAX_FALLBACK_CANDIDATES = 12;
  const selectors = Array.from(selectorSet).slice(0, MAX_FALLBACK_CANDIDATES);

  if (selectorSet.size > MAX_FALLBACK_CANDIDATES) {
    reasons.push(`Capped fallback candidates to ${MAX_FALLBACK_CANDIDATES}`);
  }

  if (selectors.length === 0) {
    reasons.push('No fallback selectors could be generated (insufficient information)');
  }

  return { selectors, reasons };
}

/**
 * Escape special characters in text content for selector usage
 * Handles quotes, backslashes, and newlines
 */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/"/g, '\\"') // Escape quotes
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Generate selectors using getByRole/getByText patterns (Playwright-style)
 * These are higher-level semantic selectors that Playwright understands
 *
 * @param fallbacks - Fallback strategies from anchor definition
 * @param hints - Additional hints from AST extraction (optional)
 * @returns Playwright-style selector candidates
 */
export function generatePlaywrightFallbacks(
  fallbacks: Fallbacks,
  hints?: { tag?: string; classList?: string[]; role?: string; text?: string }
): FallbackSelectorResult {
  const selectors: string[] = [];
  const reasons: string[] = [];

  const effectiveRole = fallbacks.role ?? hints?.role;
  const effectiveText = fallbacks.text ?? hints?.text;

  // getByRole (most semantic and stable)
  if (effectiveRole) {
    if (effectiveText) {
      // Role with accessible name (text)
      selectors.push(`getByRole('${effectiveRole}', { name: '${escapeText(effectiveText)}' })`);
      reasons.push('Using Playwright getByRole with accessible name');
    } else {
      selectors.push(`getByRole('${effectiveRole}')`);
      reasons.push('Using Playwright getByRole');
    }
  }

  // getByText (useful when role is not available)
  if (effectiveText && !effectiveRole) {
    selectors.push(`getByText('${escapeText(effectiveText)}')`);
    reasons.push('Using Playwright getByText');

    // Partial text match
    selectors.push(`getByText('${escapeText(effectiveText)}', { exact: false })`);
    reasons.push('Using Playwright getByText with partial match');
  }

  if (selectors.length === 0) {
    reasons.push('No Playwright fallback selectors could be generated');
  }

  return { selectors, reasons };
}
