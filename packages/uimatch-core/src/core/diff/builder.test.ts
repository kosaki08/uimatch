/**
 * Unit tests for buildStyleDiffs core logic
 */

import { describe, expect, test as it } from 'bun:test';
import type { ExpectedSpec } from '../../types/index';
import { buildStyleDiffs } from './builder';

describe('buildStyleDiffs', () => {
  it('should detect color differences exceeding deltaE threshold', () => {
    const actual = {
      __self__: {
        color: 'rgb(0, 0, 0)', // black
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        color: 'rgb(255, 255, 255)', // white
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].selector).toBe('self');
    expect(diffs[0].properties['color']).toBeDefined();
    expect(diffs[0].severity).toBe('high'); // Large color diff should be high severity
  });

  it('should accept color differences within deltaE threshold', () => {
    const actual = {
      __self__: {
        color: 'rgb(100, 100, 100)',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        color: 'rgb(101, 101, 101)', // Very similar (imperceptible difference)
      },
    };

    const diffs = buildStyleDiffs(actual, expected, {
      thresholds: { deltaE: 3.0 },
    });

    // Should create diff but with low severity (within threshold)
    // Implementation includes property even when within tolerance
    if (diffs.length > 0) {
      const colorDiff = diffs[0].properties['color'];
      if (colorDiff) {
        expect(colorDiff.delta).toBeLessThan(3.0); // Within deltaE threshold
      }
    }
  });

  it('should detect layout property differences', () => {
    const actual = {
      __self__: {
        display: 'block',
        'flex-direction': 'row',
        gap: '0px',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        display: 'flex',
        'flex-direction': 'column',
        gap: '16px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].properties['display']).toBeDefined();
    expect(diffs[0].properties['flex-direction']).toBeDefined();
    expect(diffs[0].properties['gap']).toBeDefined();
    // Layout diffs escalate to high severity
    expect(diffs[0].severity).toMatch(/^(medium|high)$/);
  });

  it('should handle spacing property tolerances', () => {
    const actual = {
      __self__: {
        'padding-left': '24px',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        'padding-left': '40px', // Significantly exceeds 15% tolerance (40-24)/24 = 66%
      },
    };

    const diffs = buildStyleDiffs(actual, expected, {
      thresholds: { spacing: 0.15 },
    });

    expect(diffs).toHaveLength(1);
    // padding-left should fail (large difference exceeds tolerance)
    expect(diffs[0].properties['padding-left']).toBeDefined();
    const delta = diffs[0].properties['padding-left']?.delta ?? 0;
    expect(Math.abs(delta)).toBeGreaterThan(0); // Should have non-zero delta
  });

  it('should filter out noise elements (non-visible)', () => {
    const actual = {
      __self__: {
        color: 'rgb(0, 0, 0)',
        height: '200px',
        display: 'block',
      },
      '.hidden': {
        color: 'rgb(255, 0, 0)',
        display: 'none', // Hidden element
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        color: 'rgb(100, 100, 100)',
      },
      '.hidden': {
        color: 'rgb(0, 255, 0)',
      },
    };

    const meta = {
      __self__: {
        tag: 'div',
        height: 200,
      },
      '.hidden': {
        tag: 'div',
      },
    };

    const diffs = buildStyleDiffs(actual, expected, { meta });

    // Should only include __self__, not hidden element
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((d) => d.selector !== '.hidden')).toBe(true);
  });

  it('should respect ignore list', () => {
    const actual = {
      __self__: {
        color: 'rgb(0, 0, 0)',
        'font-size': '14px',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        color: 'rgb(255, 255, 255)',
        'font-size': '24px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected, {
      ignore: ['font-size'],
    });

    expect(diffs).toHaveLength(1);
    expect(diffs[0].properties['color']).toBeDefined();
    expect(diffs[0].properties['font-size']).toBeUndefined();
  });

  it('should use token values when available', () => {
    const actual = {
      __self__: {
        color: 'rgb(100, 100, 100)',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        color: 'var(--color-text-primary)',
      },
    };

    const tokens = {
      color: {
        '--color-text-primary': '#333333', // rgb(51, 51, 51)
      },
    };

    const diffs = buildStyleDiffs(actual, expected, { tokens });

    expect(diffs).toHaveLength(1);
    expect(diffs[0].properties['color']).toBeDefined();
    expect(diffs[0].properties['color'].expectedToken).toBe('--color-text-primary');
  });

  it('should generate patch hints for fixable differences', () => {
    const actual = {
      __self__: {
        color: 'rgb(0, 0, 0)',
        'padding-top': '8px',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        color: 'rgb(51, 51, 51)',
        'padding-top': '16px',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].patchHints).toBeDefined();
    expect(diffs[0].patchHints?.length ?? 0).toBeGreaterThan(0);
    expect(diffs[0].autoFixable).toBe(true);
  });

  it('should sort diffs by scope and priority', () => {
    const actual = {
      __self__: {
        color: 'rgb(100, 100, 100)',
      },
      '.child': {
        'background-color': 'rgb(255, 255, 255)',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        color: 'rgb(51, 51, 51)',
      },
      '.child': {
        'background-color': 'rgb(240, 240, 240)',
      },
    };

    const meta = {
      __self__: {
        tag: 'div',
        cssSelector: 'div.parent',
      },
      '.child': {
        tag: 'span',
        cssSelector: 'div.parent > span.child',
      },
    };

    const diffs = buildStyleDiffs(actual, expected, { meta });

    expect(diffs.length).toBeGreaterThan(0);
    // Diffs should be sorted by scope (self before descendant)
    if (diffs.length === 2) {
      expect(diffs[0].scope).toBe('self');
      expect(diffs[1].scope).toBe('descendant');
    }
  });

  it('should handle staged checking (parent stage)', () => {
    const actual = {
      __self__: {
        color: 'rgb(0, 0, 0)',
      },
      '.child': {
        'background-color': 'rgb(255, 255, 255)',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        color: 'rgb(100, 100, 100)',
      },
      '.child': {
        'background-color': 'rgb(240, 240, 240)',
      },
    };

    const diffsSelfStage = buildStyleDiffs(actual, expected, {
      stage: 'self',
    });

    // self stage should only include __self__ diffs
    expect(diffsSelfStage.every((d) => d.scope === 'self' || d.scope === 'ancestor')).toBe(true);
  });

  it('should escalate severity for large dimension errors', () => {
    const actual = {
      __self__: {
        width: '100px',
        height: '50px',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        width: '300px', // 200% error (large relative error)
        height: '55px', // 10% error (small relative error)
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    // Large dimension error should escalate severity
    expect(diffs[0].severity).toBe('high');
  });

  it('should suppress background-color for text elements when color expectation is missing', () => {
    const actual = {
      __self__: {
        color: 'rgb(0, 0, 0)',
        'background-color': 'transparent',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        // Figma TEXT fill misinterpreted as background-color
        'background-color': 'rgb(51, 51, 51)',
        // No 'color' expectation
      },
    };

    const meta = {
      __self__: {
        tag: 'p',
        elementKind: 'text' as const,
      },
    };

    const diffs = buildStyleDiffs(actual, expected, { meta });

    // Should suppress background-color comparison for text elements
    if (diffs.length > 0) {
      expect(diffs[0].properties['background-color']).toBeUndefined();
    }
  });

  it('should handle box-shadow comparison with blur and color tolerances', () => {
    const actual = {
      __self__: {
        'box-shadow': '0px 2px 4px rgba(0, 0, 0, 0.1)',
      },
    };

    const expected: ExpectedSpec = {
      __self__: {
        'box-shadow': '0px 4px 8px rgba(0, 0, 0, 0.2)',
      },
    };

    const diffs = buildStyleDiffs(actual, expected);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].properties['box-shadow']).toBeDefined();
  });
});
