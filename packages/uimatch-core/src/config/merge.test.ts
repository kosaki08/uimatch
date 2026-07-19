import { describe, expect, test } from 'vitest';
import { DEFAULT_CONFIG } from './defaults';
import { mergeConfig } from './merge';

describe('mergeConfig', () => {
  test('allows explicit zero quality-gate thresholds', () => {
    const config = mergeConfig({
      comparison: {
        ...DEFAULT_CONFIG.comparison,
        acceptancePixelDiffRatio: 0,
        acceptanceColorDeltaE: 0,
      },
    });

    expect(config.comparison.acceptancePixelDiffRatio).toBe(0);
    expect(config.comparison.acceptanceColorDeltaE).toBe(0);
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid direct comparison threshold %p',
    (threshold) => {
      expect(() =>
        mergeConfig({
          comparison: {
            ...DEFAULT_CONFIG.comparison,
            toleranceSpacing: threshold,
          },
        })
      ).toThrow();
    }
  );
});
