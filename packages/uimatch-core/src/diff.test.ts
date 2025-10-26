/**
 * Unit tests for style diff calculation
 */

import { describe, expect, test } from 'bun:test';
import { buildStyleDiffs } from './diff';
import type { ExpectedSpec, StyleDiff, TokenMap } from './types/index';

/**
 * Helper to safely get first diff from array
 */
function getFirstDiff(diffs: StyleDiff[]): StyleDiff {
  const first = diffs[0];
  if (!first) throw new Error('Expected at least one diff');
  return first;
}

/**
 * Helper to get property from diff with type guard
 */
function getProp(diff: StyleDiff, propName: string): NonNullable<StyleDiff['properties'][string]> {
  const prop = diff.properties[propName];
  if (!prop) throw new Error(`Expected property '${propName}' to be defined`);
  return prop;
}

describe('buildStyleDiffs', () => {
  test('detects font-size difference', () => {
    const actual = {
      __self__: {
        'font-size': '14px',
        color: '#000000',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'font-size': '16px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.path).toBe('self');

    const fontSizeProp = getProp(firstDiff, 'font-size');
    expect(fontSizeProp.actual).toBe('14px');
    expect(fontSizeProp.expected).toBe('16px');
    expect(fontSizeProp.delta).toBe(-2);
    expect(firstDiff.severity).toBe('medium');
  });

  test('detects color difference', () => {
    const actual = {
      __self__: {
        color: '#FF0000', // Red
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        color: '#0000FF', // Blue
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const colorProp = getProp(firstDiff, 'color');
    expect(colorProp.actual).toBe('#FF0000');
    expect(colorProp.expected).toBe('#0000FF');
    expect(colorProp.unit).toBe('ΔE');
    expect(colorProp.delta).toBeGreaterThan(50); // Large perceptual difference
    expect(firstDiff.severity).toBe('high'); // Large color diff -> high severity
  });

  test('uses token map for color comparison', () => {
    const actual = {
      __self__: {
        color: '#1E40AF', // Actual blue-600
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        color: 'var(--color-primary-600)',
      },
    };
    const tokens: TokenMap = {
      color: {
        '--color-primary-600': '#1E40AF', // Same as actual
      },
    };

    const diffs = buildStyleDiffs(actual, expected, { tokens });

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const colorProp = getProp(firstDiff, 'color');
    expect(colorProp.expectedToken).toBe('--color-primary-600');
    expect(colorProp.delta).toBeLessThanOrEqual(3); // Should be close to 0
    expect(firstDiff.severity).toBe('low'); // Match -> low severity
  });

  test('detects line-height difference', () => {
    const actual = {
      __self__: {
        'font-size': '16px',
        'line-height': '20px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'line-height': '24px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const lineHeightProp = getProp(firstDiff, 'line-height');
    expect(lineHeightProp.actual).toBe('20px');
    expect(lineHeightProp.expected).toBe('24px');
    expect(lineHeightProp.delta).toBe(-4);
    expect(firstDiff.severity).toBe('medium');
  });

  test('handles normal line-height', () => {
    const actual = {
      __self__: {
        'font-size': '16px',
        'line-height': 'normal',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'line-height': 'normal',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    // Should be within tolerance (19.2px == 19.2px)
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.severity).toBe('low');
  });

  test('detects font-weight difference', () => {
    const actual = {
      __self__: {
        'font-weight': '400',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'font-weight': '700',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const fontWeightProp = getProp(firstDiff, 'font-weight');
    expect(fontWeightProp.actual).toBe('400');
    expect(fontWeightProp.expected).toBe('700');
    expect(fontWeightProp.delta).toBe(-300);
    expect(firstDiff.severity).toBe('medium');
  });

  test('detects border-radius difference', () => {
    const actual = {
      __self__: {
        'border-radius': '4px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'border-radius': '8px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const borderRadiusProp = getProp(firstDiff, 'border-radius');
    expect(borderRadiusProp.actual).toBe('4px');
    expect(borderRadiusProp.expected).toBe('8px');
    expect(borderRadiusProp.delta).toBe(-4);
    expect(firstDiff.severity).toBe('medium');
  });

  test('detects spacing differences', () => {
    const actual = {
      __self__: {
        'padding-top': '8px',
        'padding-right': '16px',
        'padding-bottom': '8px',
        'padding-left': '16px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'padding-top': '12px',
        'padding-right': '24px',
        'padding-bottom': '12px',
        'padding-left': '24px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const paddingTopProp = getProp(firstDiff, 'padding-top');
    const paddingRightProp = getProp(firstDiff, 'padding-right');
    expect(paddingTopProp.delta).toBe(-4);
    expect(paddingRightProp.delta).toBe(-8);
    expect(firstDiff.severity).toBe('medium');
  });

  test('respects ignore option', () => {
    const actual = {
      __self__: {
        'font-size': '14px',
        color: '#FF0000',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'font-size': '16px',
        color: '#0000FF',
      },
    };

    const diffs = buildStyleDiffs(actual, expected, { ignore: ['color'] });

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.properties['font-size']).toBeDefined();
    expect(firstDiff.properties['color']).toBeUndefined();
  });

  test('generates patch hints for color with token', () => {
    const actual = {
      __self__: {
        color: '#FF0000',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        color: 'var(--color-primary-600)',
      },
    };
    const tokens: TokenMap = {
      color: {
        '--color-primary-600': '#1E40AF',
      },
    };

    const diffs = buildStyleDiffs(actual, expected, { tokens });

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.patchHints).toBeDefined();
    const colorHint = firstDiff.patchHints?.find((h) => h.property === 'color');
    expect(colorHint).toBeDefined();
    expect(colorHint?.suggestedValue).toBe('var(--color-primary-600)');
    expect(colorHint?.severity).toBe('high');
  });

  test('generates patch hints for font-size', () => {
    const actual = {
      __self__: {
        'font-size': '14px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'font-size': '16px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.patchHints).toBeDefined();
    const fontSizeHint = firstDiff.patchHints?.find((h) => h.property === 'font-size');
    expect(fontSizeHint).toBeDefined();
    expect(fontSizeHint?.suggestedValue).toBe('16px');
  });

  test('handles empty expected spec', () => {
    const actual = {
      __self__: {
        'font-size': '16px',
        color: '#000000',
      },
    };
    const expected: ExpectedSpec = {};

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.severity).toBe('low'); // No differences to detect
  });

  test('handles box-shadow difference', () => {
    const actual = {
      __self__: {
        'box-shadow': '0px 2px 4px rgba(0, 0, 0, 0.5)',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'box-shadow': '0px 4px 8px rgba(0, 0, 0, 0.5)',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.properties['box-shadow']).toBeDefined();
    expect(firstDiff.severity).toBe('medium');
  });
});
