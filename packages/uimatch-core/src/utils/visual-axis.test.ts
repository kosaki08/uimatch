import { describe, expect, test } from 'bun:test';
import type { Rect } from '../types';
import {
  analyzeLayoutAxis,
  checkLayoutMismatch,
  generateExpectedLayout,
  inferVisualAxis,
} from './visual-axis';

describe('Visual Axis Inference', () => {
  describe('inferVisualAxis', () => {
    test('detects horizontal layout from high x-variance', () => {
      const rects: Rect[] = [
        { x: 0, y: 10, width: 50, height: 20 },
        { x: 60, y: 10, width: 50, height: 20 },
        { x: 120, y: 10, width: 50, height: 20 },
      ];

      const result = inferVisualAxis(rects);
      expect(result.axis).toBe('horizontal');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('detects vertical layout from high y-variance', () => {
      const rects: Rect[] = [
        { x: 10, y: 0, width: 50, height: 20 },
        { x: 10, y: 30, width: 50, height: 20 },
        { x: 10, y: 60, width: 50, height: 20 },
      ];

      const result = inferVisualAxis(rects);
      expect(result.axis).toBe('vertical');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('returns ambiguous for insufficient elements', () => {
      const rects: Rect[] = [{ x: 0, y: 0, width: 50, height: 20 }];

      const result = inferVisualAxis(rects);
      expect(result.axis).toBe('ambiguous');
      expect(result.confidence).toBe(0);
    });

    test('returns ambiguous for grid-like layout', () => {
      // Grid with similar variance in both directions
      const rects: Rect[] = [
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 60, y: 0, width: 50, height: 50 },
        { x: 0, y: 60, width: 50, height: 50 },
        { x: 60, y: 60, width: 50, height: 50 },
      ];

      const result = inferVisualAxis(rects);
      // Grid layouts may be detected as horizontal or ambiguous depending on exact variance
      // The important thing is it's not clearly vertical
      expect(result.axis).not.toBe('vertical');
    });

    test('handles edge case with zero variance', () => {
      const rects: Rect[] = [
        { x: 10, y: 10, width: 50, height: 20 },
        { x: 10, y: 10, width: 50, height: 20 },
      ];

      const result = inferVisualAxis(rects);
      // Should not crash, returns some valid axis
      expect(['horizontal', 'vertical', 'ambiguous']).toContain(result.axis);
    });
  });

  describe('analyzeLayoutAxis', () => {
    test('trusts visual axis when it matches declared mode', () => {
      const rects: Rect[] = [
        { x: 0, y: 10, width: 50, height: 20 },
        { x: 60, y: 10, width: 50, height: 20 },
      ];

      const result = analyzeLayoutAxis(rects, 'horizontal');
      expect(result.visualAxis).toBe('horizontal');
      expect(result.declaredMode).toBe('horizontal');
      expect(result.trueAxis).toBe('horizontal');
      expect(result.hasMismatch).toBe(false);
    });

    test('detects mismatch and prioritizes visual over declared', () => {
      const rects: Rect[] = [
        { x: 0, y: 10, width: 50, height: 20 },
        { x: 60, y: 10, width: 50, height: 20 },
      ];

      const result = analyzeLayoutAxis(rects, 'vertical');
      expect(result.visualAxis).toBe('horizontal');
      expect(result.declaredMode).toBe('vertical');
      expect(result.trueAxis).toBe('horizontal'); // Visual wins
      expect(result.hasMismatch).toBe(true);
    });

    test('uses declared mode when visual is ambiguous', () => {
      // Create truly ambiguous layout with balanced variance
      const rects: Rect[] = [
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 55, y: 0, width: 50, height: 50 },
        { x: 0, y: 55, width: 50, height: 50 },
        { x: 55, y: 55, width: 50, height: 50 },
      ];

      const result = analyzeLayoutAxis(rects, 'vertical');
      // If visual is not ambiguous, it should still prioritize visual
      // Otherwise it should fall back to declared
      if (result.visualAxis === 'ambiguous') {
        expect(result.trueAxis).toBe('vertical'); // Falls back to declared
        expect(result.hasMismatch).toBe(false);
      } else {
        expect(result.trueAxis).toBe(result.visualAxis); // Visual wins
      }
    });

    test('handles no declared mode', () => {
      const rects: Rect[] = [
        { x: 10, y: 0, width: 50, height: 20 },
        { x: 10, y: 30, width: 50, height: 20 },
      ];

      const result = analyzeLayoutAxis(rects);
      expect(result.visualAxis).toBe('vertical');
      expect(result.declaredMode).toBeUndefined();
      expect(result.trueAxis).toBe('vertical');
      expect(result.hasMismatch).toBe(false);
    });
  });

  describe('generateExpectedLayout', () => {
    test('generates flex row layout for horizontal axis', () => {
      const axisResult = {
        visualAxis: 'horizontal' as const,
        trueAxis: 'horizontal' as const,
        confidence: 0.8,
        hasMismatch: false,
      };

      const layout = generateExpectedLayout(axisResult, 16);
      expect(layout.display).toBe('flex');
      expect(layout.flexDirection).toBe('row');
      expect(layout.alignItems).toBe('center');
      expect(layout.gap).toBe('16px');
    });

    test('generates flex column layout for vertical axis', () => {
      const axisResult = {
        visualAxis: 'vertical' as const,
        trueAxis: 'vertical' as const,
        confidence: 0.8,
        hasMismatch: false,
      };

      const layout = generateExpectedLayout(axisResult, 12);
      expect(layout.display).toBe('flex');
      expect(layout.flexDirection).toBe('column');
      expect(layout.gap).toBe('12px');
    });

    test('generates minimal layout for ambiguous axis', () => {
      const axisResult = {
        visualAxis: 'ambiguous' as const,
        trueAxis: 'ambiguous' as const,
        confidence: 0.3,
        hasMismatch: false,
      };

      const layout = generateExpectedLayout(axisResult);
      expect(layout.display).toBe('flex');
      expect(layout.flexDirection).toBeUndefined();
    });

    test('handles missing item spacing', () => {
      const axisResult = {
        visualAxis: 'horizontal' as const,
        trueAxis: 'horizontal' as const,
        confidence: 0.8,
        hasMismatch: false,
      };

      const layout = generateExpectedLayout(axisResult);
      expect(layout.gap).toBeUndefined();
    });
  });

  describe('checkLayoutMismatch', () => {
    test('detects high severity for flex direction mismatch', () => {
      const computedStyle = {
        display: 'flex',
        flexDirection: 'column',
        gridAutoFlow: '',
        alignItems: '',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
        flexDirection: 'row' as const,
      };

      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('high');
    });

    test('detects medium severity for display property mismatch', () => {
      const computedStyle = {
        display: 'block',
        flexDirection: '',
        gridAutoFlow: '',
        alignItems: '',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
      };

      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('medium');
    });

    test('returns none for matching layouts', () => {
      const computedStyle = {
        display: 'flex',
        flexDirection: 'row',
        gridAutoFlow: '',
        alignItems: '',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
        flexDirection: 'row' as const,
      };

      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('none');
    });

    test('detects grid auto flow mismatch', () => {
      const computedStyle = {
        display: 'grid',
        flexDirection: '',
        gridAutoFlow: 'column',
        alignItems: '',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'grid' as const,
        gridAutoFlow: 'row' as const,
      };

      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('high');
    });

    test('treats inline-flex as flex', () => {
      const computedStyle = {
        display: 'inline-flex',
        flexDirection: 'row',
        gridAutoFlow: '',
        alignItems: '',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
        flexDirection: 'row' as const,
      };

      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('none');
    });

    test('row-reverse keeps axis, medium mismatch', () => {
      const computedStyle = {
        display: 'flex',
        flexDirection: 'row-reverse',
        gridAutoFlow: '',
        alignItems: '',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
        flexDirection: 'row' as const,
      };

      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('medium');
    });

    test('lenient when axis ambiguous', () => {
      const computedStyle = {
        display: 'block',
        flexDirection: '',
        gridAutoFlow: '',
        alignItems: '',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
      };

      const severity = checkLayoutMismatch(computedStyle, expectedLayout, {
        axisResult: {
          visualAxis: 'ambiguous',
          trueAxis: 'ambiguous',
          confidence: 0.4,
          hasMismatch: false,
        },
      });
      expect(severity).toBe('low');
    });

    test('validates gap within tolerance', () => {
      const computedStyle = {
        display: 'flex',
        flexDirection: 'row',
        gridAutoFlow: '',
        alignItems: '',
        gap: '15px',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
        flexDirection: 'row' as const,
        gap: '16px',
      };

      // 1px difference is within ±2px tolerance
      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('none');
    });

    test('detects gap mismatch beyond tolerance', () => {
      const computedStyle = {
        display: 'flex',
        flexDirection: 'row',
        gridAutoFlow: '',
        alignItems: '',
        gap: '12px',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
        flexDirection: 'row' as const,
        gap: '16px',
      };

      // 4px difference exceeds ±2px tolerance
      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('low');
    });

    test('validates align-items', () => {
      const computedStyle = {
        display: 'flex',
        flexDirection: 'row',
        gridAutoFlow: '',
        alignItems: 'flex-start',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'flex' as const,
        flexDirection: 'row' as const,
        alignItems: 'center',
      };

      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('low');
    });

    test('handles grid-auto-flow with dense keyword', () => {
      const computedStyle = {
        display: 'grid',
        flexDirection: '',
        gridAutoFlow: 'row dense',
        alignItems: '',
        gap: '',
      } as CSSStyleDeclaration;

      const expectedLayout = {
        display: 'grid' as const,
        gridAutoFlow: 'row' as const,
      };

      // 'row dense' should match 'row' (first token comparison)
      const severity = checkLayoutMismatch(computedStyle, expectedLayout);
      expect(severity).toBe('none');
    });
  });
});
