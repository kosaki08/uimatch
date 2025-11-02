/**
 * Scope classification for CSS properties (ancestor/self/descendant)
 */

import type { CheckingStage, DiffScope } from '../../types/index';
import { toKebabCase } from './utils';

/**
 * Expand shorthand properties to their longhand equivalents
 * This ensures consistent scope classification regardless of whether
 * the design/implementation uses shorthand or longhand notation
 * @param prop CSS property name (kebab-case)
 * @returns Array of longhand property names
 */
export function expandShorthand(prop: string): string[] {
  const normalized = toKebabCase(prop);

  // Shorthand expansions (minimal set for scope detection)
  switch (normalized) {
    case 'margin':
      return ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
    case 'padding':
      return ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
    case 'border':
      return ['border-width', 'border-style', 'border-color'];
    case 'background':
      return ['background-color']; // Minimal expansion for scope purposes
    case 'outline':
      return ['outline-width', 'outline-style', 'outline-color'];
    default:
      break;
  }

  // Handle border-side shorthand (border-top, border-right, border-bottom, border-left)
  const borderSideMatch = normalized.match(/^border-(top|right|bottom|left)$/);
  if (borderSideMatch) {
    const side = borderSideMatch[1];
    return [`border-${side}-width`, `border-${side}-style`, `border-${side}-color`];
  }

  return [normalized];
}

/**
 * Determine the scope of a CSS property for staged checking
 * Accepts both kebab-case and camelCase, handles shorthand properties
 * @param prop CSS property name
 * @returns Scope classification (ancestor/self/descendant)
 */
export function getPropertyScope(prop: string): DiffScope {
  // Normalize and expand shorthand
  const props = expandShorthand(prop);

  // Parent container properties (background, border-radius, padding, gap, etc.)
  const ancestorProps = new Set([
    'background-color',
    'border-radius',
    'border-width',
    'border-style',
    'border-color',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'gap',
    'column-gap',
    'row-gap',
  ]);

  // Self properties (typography, sizing, positioning, etc.)
  // box-shadow moved here as it's typically element decoration, not container property
  const selfProps = new Set([
    'color',
    'font-size',
    'font-weight',
    'font-family',
    'line-height',
    'letter-spacing',
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'display',
    'flex-direction',
    'align-items',
    'justify-content',
    'flex-wrap',
    'align-content',
    'place-items',
    'place-content',
    'flex-grow',
    'flex-shrink',
    'flex-basis',
    'opacity',
    'text-align',
    'text-transform',
    'text-decoration-line',
    'white-space',
    'word-break',
    'box-sizing',
    'overflow-x',
    'overflow-y',
    'grid-template-columns',
    'grid-template-rows',
    'grid-auto-flow',
    'box-shadow', // Shadow is typically element decoration
    'box-shadow-offset-x', // Synthetic property from box-shadow comparison
    'box-shadow-offset-y', // Synthetic property from box-shadow comparison
    'outline-width', // Outline is element decoration
    'outline-style',
    'outline-color',
  ]);

  // Descendant properties (margin, which affects child spacing)
  const descendantProps = new Set(['margin-top', 'margin-right', 'margin-bottom', 'margin-left']);

  // If any expanded property matches ancestor scope, classify as ancestor
  if (props.some((p) => ancestorProps.has(p))) return 'ancestor';
  if (props.some((p) => descendantProps.has(p))) return 'descendant';
  if (props.some((p) => selfProps.has(p))) return 'self';

  // Default to self for unknown properties
  return 'self';
}

/**
 * Determine the dominant scope for a style diff based on its properties
 * Only counts properties that have actual differences (non-zero delta or different values)
 * @param propDiffs Property-level differences
 * @returns Dominant scope (ancestor/self/descendant)
 */
export function getDominantScope(
  propDiffs: Record<string, { actual?: string; expected?: string; delta?: number; unit?: string }>
): DiffScope {
  // Filter to only properties with actual differences
  const diffProps = Object.keys(propDiffs).filter((prop) => {
    const diff = propDiffs[prop];
    if (!diff) return false;
    // Has difference if delta is non-zero or actual !== expected
    const hasDelta = diff.delta !== undefined && diff.delta !== 0;
    const valuesDiffer =
      diff.actual !== undefined && diff.expected !== undefined && diff.actual !== diff.expected;
    return hasDelta || valuesDiffer;
  });

  const scopes = diffProps.map(getPropertyScope);

  // Count each scope type
  const scopeCounts = scopes.reduce(
    (acc, scope) => {
      acc[scope] = (acc[scope] || 0) + 1;
      return acc;
    },
    {} as Record<DiffScope, number>
  );

  // Return the scope with the highest count
  // Priority: ancestor > self > descendant (for ties)
  const ancestorCount = scopeCounts['ancestor'] || 0;
  const selfCount = scopeCounts['self'] || 0;
  const descendantCount = scopeCounts['descendant'] || 0;

  if (ancestorCount > 0 && ancestorCount >= selfCount && ancestorCount >= descendantCount) {
    return 'ancestor';
  }
  if (selfCount > 0 && selfCount >= descendantCount) {
    return 'self';
  }
  return 'descendant';
}

/**
 * Check if a diff should be included based on the checking stage
 * @param scope Scope of the diff
 * @param stage Current checking stage
 * @returns True if diff should be included
 */
export function shouldIncludeDiffAtStage(scope: DiffScope, stage: CheckingStage): boolean {
  if (stage === 'all') return true;

  if (stage === 'parent') {
    return scope === 'ancestor';
  }

  if (stage === 'self') {
    return scope === 'self';
  }

  if (stage === 'children') {
    return scope === 'descendant';
  }

  return true;
}
