/**
 * Default CSS property constants for Playwright adapter
 */

/**
 * Default CSS properties to extract from captured elements.
 * Includes typography, colors, layout (flex/grid), borders, spacing, and dimensions.
 */
export const DEFAULT_PROPS = [
  'width',
  'height',
  'font-size',
  'line-height',
  'font-weight',
  'font-family',
  'letter-spacing',
  'color',
  'background-color',
  'border-radius',
  'border-color',
  'border-width',
  // Side-specific border properties
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'box-shadow',
  'display',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-content',
  'gap',
  'column-gap',
  'row-gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'place-items',
  'place-content',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  // Text & formatting
  'text-align',
  'text-transform',
  'text-decoration-line',
  'text-decoration-thickness',
  'text-underline-offset',
  'white-space',
  'word-break',
  // Sizing constraints
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'box-sizing',
  // Overflow
  'overflow-x',
  'overflow-y',
  // Flex extras
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  // Visual
  'opacity',
  // Position (for layout category)
  'position',
  'top',
  'right',
  'bottom',
  'left',
] as const;

export const EXTENDED_PROPS = [
  ...DEFAULT_PROPS,
  'z-index',
  'align-self',
  'place-self',
  'outline-width',
  'outline-style',
  'outline-color',
  'outline-offset',
  'filter',
  'backdrop-filter',
  'text-wrap',
] as const;
