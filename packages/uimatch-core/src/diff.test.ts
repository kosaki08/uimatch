/**
 * Unit tests for style diff calculation
 */

import { describe, expect, test } from 'bun:test';
import { buildStyleDiffs } from './core/diff';
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

  test('detects box-shadow offset difference', () => {
    const actual = {
      __self__: {
        'box-shadow': '0px 4px 8px rgba(0, 0, 0, 0.3)',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'box-shadow': '0px 6px 8px rgba(0, 0, 0, 0.3)',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    // Main box-shadow property should be present
    expect(firstDiff.properties['box-shadow']).toBeDefined();

    // Auxiliary offset-y property should be present
    const offsetY = firstDiff.properties['box-shadow-offset-y'];
    expect(offsetY).toBeDefined();
    expect(offsetY?.actual).toBe('4px');
    expect(offsetY?.expected).toBe('6px');
    expect(offsetY?.delta).toBe(-2);

    // Auxiliary properties should NOT appear in patchHints
    const offsetHints = firstDiff.patchHints?.filter((h) =>
      h.property.startsWith('box-shadow-offset-')
    );
    expect(offsetHints).toHaveLength(0);

    // Main box-shadow hint should be present
    const shadowHint = firstDiff.patchHints?.find((h) => h.property === 'box-shadow');
    expect(shadowHint).toBeDefined();
    expect(shadowHint?.suggestedValue).toBe('0px 6px 8px rgba(0, 0, 0, 0.3)');

    expect(firstDiff.severity).toBe('medium');
  });

  test('handles box-shadow with inset', () => {
    const actual = {
      __self__: {
        'box-shadow': 'inset 0px 2px 4px rgba(0, 0, 0, 0.5)',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'box-shadow': 'inset 0px 4px 8px rgba(0, 0, 0, 0.5)',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    // Should detect offset difference even with inset
    const offsetY = firstDiff.properties['box-shadow-offset-y'];
    expect(offsetY).toBeDefined();
    expect(offsetY?.actual).toBe('2px');
    expect(offsetY?.expected).toBe('4px');
    expect(offsetY?.delta).toBe(-2);

    expect(firstDiff.severity).toBe('medium');
  });

  test('detects width difference', () => {
    const actual = {
      __self__: {
        width: '180px',
        height: '100px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        width: '200px',
        height: '100px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const widthProp = getProp(firstDiff, 'width');
    expect(widthProp.actual).toBe('180px');
    expect(widthProp.expected).toBe('200px');
    expect(widthProp.delta).toBe(-20);
    expect(widthProp.unit).toBe('px');

    // Height should match, so no diff expected
    expect(firstDiff.properties['height']).toBeDefined();

    expect(firstDiff.severity).toBe('medium');
  });

  test('detects height difference', () => {
    const actual = {
      __self__: {
        width: '200px',
        height: '80px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        width: '200px',
        height: '100px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const heightProp = getProp(firstDiff, 'height');
    expect(heightProp.actual).toBe('80px');
    expect(heightProp.expected).toBe('100px');
    expect(heightProp.delta).toBe(-20);
    expect(heightProp.unit).toBe('px');

    expect(firstDiff.severity).toBe('medium');
  });

  test('normalizes display (inline-flex → flex)', () => {
    const actual = {
      __self__: {
        display: 'inline-flex',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        display: 'flex',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.properties['display']).toBeDefined();
    expect(firstDiff.severity).toBe('low'); // Should match after normalization
  });

  test('normalizes display (inline-grid → grid)', () => {
    const actual = {
      __self__: {
        display: 'inline-grid',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        display: 'grid',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.properties['display']).toBeDefined();
    expect(firstDiff.severity).toBe('low'); // Should match after normalization
  });

  test('detects flex-wrap difference', () => {
    const actual = {
      __self__: {
        'flex-wrap': 'nowrap',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'flex-wrap': 'wrap',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    const flexWrapProp = getProp(firstDiff, 'flex-wrap');
    expect(flexWrapProp.actual).toBe('nowrap');
    expect(flexWrapProp.expected).toBe('wrap');
    expect(firstDiff.severity).toBe('medium');
  });

  test('normalizes justify-content (start → flex-start)', () => {
    const actual = {
      __self__: {
        'justify-content': 'start',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'justify-content': 'flex-start',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);
    expect(firstDiff.properties['justify-content']).toBeDefined();
    expect(firstDiff.severity).toBe('low'); // Should match after normalization
  });

  test('detects column-gap difference with tolerance', () => {
    const actual = {
      __self__: {
        'column-gap': '15.5px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'column-gap': '16px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    // Within ±10% tolerance (16 * 0.1 = 1.6, delta = 0.5)
    expect(firstDiff.properties['column-gap']).toBeDefined();
    expect(firstDiff.severity).toBe('low'); // Within tolerance
  });

  test('detects row-gap difference outside tolerance', () => {
    const actual = {
      __self__: {
        'row-gap': '10px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'row-gap': '20px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const rowGapProp = getProp(firstDiff, 'row-gap');
    expect(rowGapProp.actual).toBe('10px');
    expect(rowGapProp.expected).toBe('20px');
    expect(rowGapProp.delta).toBe(-10);
    expect(firstDiff.severity).toBe('medium'); // Outside tolerance
  });

  test('detects grid-template-columns difference', () => {
    const actual = {
      __self__: {
        'grid-template-columns': '1fr 1fr',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'grid-template-columns': '1fr 2fr',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const gridProp = getProp(firstDiff, 'grid-template-columns');
    expect(gridProp.actual).toBe('1fr 1fr');
    expect(gridProp.expected).toBe('1fr 2fr');
    expect(firstDiff.severity).toBe('medium');
  });

  test('detects place-items difference', () => {
    const actual = {
      __self__: {
        'place-items': 'center',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'place-items': 'start',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const placeItemsProp = getProp(firstDiff, 'place-items');
    expect(placeItemsProp.actual).toBe('center');
    expect(placeItemsProp.expected).toBe('start');
    expect(firstDiff.severity).toBe('medium');
  });

  test('uses custom spacing threshold', () => {
    const actual = {
      __self__: {
        'padding-top': '14px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'padding-top': '16px',
      },
    };

    // Default threshold (15%): 16 * 0.15 = 2.4, so delta=2 should pass
    const diffsDefault = buildStyleDiffs(actual, expected);
    expect(diffsDefault[0]?.severity).toBe('low');

    // Strict threshold (5%): 16 * 0.05 = 0.8, so delta=2 should fail
    const diffsStrict = buildStyleDiffs(actual, expected, {
      thresholds: { spacing: 0.05 },
    });
    expect(diffsStrict[0]?.severity).toBe('medium');
  });

  test('uses custom dimension threshold', () => {
    const actual = {
      __self__: {
        width: '195px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        width: '200px',
      },
    };

    // Default threshold (5%): 200 * 0.05 = 10, so delta=5 should pass
    const diffsDefault = buildStyleDiffs(actual, expected);
    expect(diffsDefault[0]?.severity).toBe('low');

    // Strict threshold (2%): 200 * 0.02 = 4, so delta=5 should fail
    const diffsStrict = buildStyleDiffs(actual, expected, {
      thresholds: { dimension: 0.02 },
    });
    expect(diffsStrict[0]?.severity).toBe('medium');
  });

  test('uses custom layoutGap threshold', () => {
    const actual = {
      __self__: {
        gap: '14px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        gap: '16px',
      },
    };

    // Default threshold (10%): 16 * 0.1 = 1.6, so delta=2 should fail
    const diffsDefault = buildStyleDiffs(actual, expected);
    expect(diffsDefault[0]?.severity).toBe('medium');

    // Loose threshold (20%): 16 * 0.2 = 3.2, so delta=2 should pass
    const diffsLoose = buildStyleDiffs(actual, expected, {
      thresholds: { layoutGap: 0.2 },
    });
    expect(diffsLoose[0]?.severity).toBe('low');
  });

  test('uses custom radius threshold', () => {
    const actual = {
      __self__: {
        'border-radius': '6px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'border-radius': '8px',
      },
    };

    // Default threshold (12%): 8 * 0.12 = 0.96, so delta=2 should fail
    const diffsDefault = buildStyleDiffs(actual, expected);
    expect(diffsDefault[0]?.severity).toBe('medium');

    // Loose threshold (30%): 8 * 0.3 = 2.4, so delta=2 should pass
    const diffsLoose = buildStyleDiffs(actual, expected, {
      thresholds: { radius: 0.3 },
    });
    expect(diffsLoose[0]?.severity).toBe('low');
  });

  test('uses custom borderWidth threshold', () => {
    const actual = {
      __self__: {
        'border-width': '1px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'border-width': '2px',
      },
    };

    // Default threshold (30%): 2 * 0.3 = 0.6 (but min 1px), so delta=1 should pass
    const diffsDefault = buildStyleDiffs(actual, expected);
    expect(diffsDefault[0]?.severity).toBe('low');

    // Strict threshold (10%): 2 * 0.1 = 0.2 (but min 1px), so delta=1 should pass
    // (because Math.max(1, 0.2) = 1)
    const diffsStrict = buildStyleDiffs(actual, expected, {
      thresholds: { borderWidth: 0.1 },
    });
    expect(diffsStrict[0]?.severity).toBe('low');
  });

  test('uses custom shadowBlur threshold', () => {
    const actual = {
      __self__: {
        'box-shadow': '0px 2px 4px rgba(0, 0, 0, 0.5)',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'box-shadow': '0px 2px 6px rgba(0, 0, 0, 0.5)',
      },
    };

    // Default threshold (15%): 6 * 0.15 = 0.9 (but min 1px), so delta=2 should fail
    const diffsDefault = buildStyleDiffs(actual, expected);
    expect(diffsDefault[0]?.severity).toBe('medium');

    // Loose threshold (40%): 6 * 0.4 = 2.4, so delta=2 should pass
    const diffsLoose = buildStyleDiffs(actual, expected, {
      thresholds: { shadowBlur: 0.4 },
    });
    expect(diffsLoose[0]?.severity).toBe('low');
  });

  test('handles gap: normal as 0px', () => {
    const actual = {
      __self__: {
        gap: 'normal',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        gap: '0px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    // 'normal' should be treated as 0px, so they should match
    expect(firstDiff.properties['gap']).toBeDefined();
    expect(firstDiff.severity).toBe('low');
  });

  test('detects margin difference', () => {
    const actual = {
      __self__: {
        'margin-top': '8px',
        'margin-left': '16px',
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'margin-top': '12px',
        'margin-left': '16px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    const firstDiff = getFirstDiff(diffs);

    const marginTopProp = getProp(firstDiff, 'margin-top');
    expect(marginTopProp.actual).toBe('8px');
    expect(marginTopProp.expected).toBe('12px');
    expect(marginTopProp.delta).toBe(-4);

    // margin-left should match
    expect(firstDiff.properties['margin-left']).toBeDefined();

    expect(firstDiff.severity).toBe('medium');
  });

  test('uses custom shadowColorExtraDE threshold', () => {
    const actual = {
      __self__: {
        'box-shadow': '0px 2px 4px rgba(255, 0, 0, 0.5)', // Red
      },
    };
    const expected: ExpectedSpec = {
      __self__: {
        'box-shadow': '0px 2px 4px rgba(239, 0, 0, 0.5)', // Slightly different red (ΔE≈3.41)
      },
    };

    // Default extra tolerance (1.0): ΔE 3.41 <= 3.0+1.0=4.0 should pass
    const diffsDefault = buildStyleDiffs(actual, expected, {
      thresholds: { deltaE: 3.0 },
    });
    expect(diffsDefault[0]?.severity).toBe('low');

    // Strict extra tolerance (0.1): ΔE 3.41 > 3.0+0.1=3.1 should fail
    const diffsStrict = buildStyleDiffs(actual, expected, {
      thresholds: { deltaE: 3.0, shadowColorExtraDE: 0.1 },
    });
    expect(diffsStrict[0]?.severity).toBe('medium');
  });
});
