import { describe, expect, test } from 'vitest';
import { buildExpectedSpecFromFigma, type FigmaNodeLite } from './from-figma.js';

function rootDimensions(node: Record<string, unknown>): Record<string, string> {
  const root = buildExpectedSpecFromFigma(node).__self__ ?? {};
  return {
    ...(root.width === undefined ? {} : { width: root.width }),
    ...(root.height === undefined ? {} : { height: root.height }),
  };
}

describe('buildExpectedSpecFromFigma sizing', () => {
  test.each([
    {
      expected: { height: '40px', width: '120px' },
      horizontal: 'FIXED',
      vertical: 'FIXED',
    },
    { expected: { height: '40px' }, horizontal: 'HUG', vertical: 'FIXED' },
    { expected: { width: '120px' }, horizontal: 'FIXED', vertical: 'HUG' },
    { expected: {}, horizontal: 'FILL', vertical: 'FILL' },
  ] satisfies Array<{
    expected: Record<string, string>;
    horizontal: FigmaNodeLite['layoutSizingHorizontal'];
    vertical: FigmaNodeLite['layoutSizingVertical'];
  }>)(
    'maps $horizontal/$vertical sizing to fixed dimensions',
    ({ expected, horizontal, vertical }) => {
      expect(
        rootDimensions({
          absoluteBoundingBox: { height: 40, width: 120 },
          layoutSizingHorizontal: horizontal,
          layoutSizingVertical: vertical,
        })
      ).toEqual(expected);
    }
  );

  test.each([
    {
      expected: { height: '40px' },
      layoutMode: 'HORIZONTAL',
    },
    {
      expected: { width: '120px' },
      layoutMode: 'VERTICAL',
    },
  ])('maps legacy $layoutMode axis sizing', ({ expected, layoutMode }) => {
    expect(
      rootDimensions({
        absoluteBoundingBox: { height: 40, width: 120 },
        counterAxisSizingMode: 'FIXED',
        layoutMode,
        primaryAxisSizingMode: 'AUTO',
      })
    ).toEqual(expected);
  });

  test('keeps dimensions when sizing metadata is unavailable', () => {
    expect(rootDimensions({ absoluteBoundingBox: { height: 40, width: 120 } })).toEqual({
      height: '40px',
      width: '120px',
    });
  });

  test('ignores legacy axis fields when auto layout is disabled', () => {
    expect(
      rootDimensions({
        absoluteBoundingBox: { height: 40, width: 120 },
        counterAxisSizingMode: 'AUTO',
        layoutMode: 'NONE',
        primaryAxisSizingMode: 'AUTO',
      })
    ).toEqual({ height: '40px', width: '120px' });
  });

  test('prefers current sizing fields over legacy axis fields', () => {
    expect(
      rootDimensions({
        absoluteBoundingBox: { height: 40, width: 120 },
        counterAxisSizingMode: 'FIXED',
        layoutMode: 'HORIZONTAL',
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'HUG',
        primaryAxisSizingMode: 'FIXED',
      })
    ).toEqual({});
  });

  test.each([
    {
      label: 'current',
      node: { layoutSizingHorizontal: 'UNKNOWN' },
    },
    {
      label: 'legacy',
      node: { layoutMode: 'HORIZONTAL', primaryAxisSizingMode: 'UNKNOWN' },
    },
  ])('rejects unsupported $label sizing values', ({ node }) => {
    expect(() =>
      rootDimensions({
        ...node,
        absoluteBoundingBox: { height: 40, width: 120 },
      })
    ).toThrow(/Unsupported .*Figma horizontal sizing/);
  });
});
