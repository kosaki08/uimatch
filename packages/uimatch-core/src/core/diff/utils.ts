/**
 * Utility functions for style diff processing
 */

import { toPx } from '../../utils/normalize';

/**
 * Check if an element should be filtered out as noise (non-visible or decorative)
 * @param selector CSS selector or tag name
 * @param props Computed styles for the element
 * @param meta Element metadata (optional, for tag detection)
 * @returns True if element should be filtered out
 */
export function isNoiseElement(
  selector: string,
  props: Record<string, string>,
  meta?: { tag?: string }
): boolean {
  // Filter out non-visible elements (display:none, visibility:hidden, opacity:0)
  if (props['display'] === 'none') return true;
  if (props['visibility'] === 'hidden') return true;
  if (props['opacity'] === '0') return true;

  // Filter out zero-sized elements (only if BOTH width AND height are 0)
  // Use toPx to avoid NaN issues (auto/fit-content etc.)
  const width = toPx(props['width']);
  const height = toPx(props['height']);
  if (width === 0 && height === 0) {
    return true;
  }

  // Filter out decorative/non-visual elements (script, style, meta, link, template, noscript)
  const decorativeTags = /^(script|style|meta|link|template|noscript|head|title)$/i;
  const tagFromMeta = meta?.tag?.toLowerCase();
  const tagFromSel = selector.match(/^([a-z]+)/i)?.[1]?.toLowerCase();
  if (
    (tagFromMeta && decorativeTags.test(tagFromMeta)) ||
    (tagFromSel && decorativeTags.test(tagFromSel))
  ) {
    return true;
  }

  return false;
}

/**
 * Normalize property name to kebab-case
 * Handles both kebab-case and camelCase input
 * CSS custom properties (--*) are returned as-is without normalization
 * @param prop Property name in any case
 * @returns kebab-case property name
 */
export function toKebabCase(prop: string): string {
  // CSS custom properties (--token) should not be normalized
  if (prop.startsWith('--')) return prop;
  return prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}
