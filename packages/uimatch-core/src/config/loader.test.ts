import { describe, expect, test } from 'bun:test';
import { DEFAULT_CONFIG } from './defaults';
import { loadConfig, mergeConfig } from './loader';

describe('configuration numeric boundaries', () => {
  test.each([
    ['PIXELMATCH_THRESHOLD', '-0.1'],
    ['PIXELMATCH_THRESHOLD', 'NaN'],
    ['PIXELMATCH_THRESHOLD', 'Infinity'],
    ['PIXELMATCH_THRESHOLD', ''],
    ['PIXELMATCH_THRESHOLD', '   '],
    ['PIXELMATCH_THRESHOLD', '0.1junk'],
    ['COLOR_DELTA_E_THRESHOLD', '-1'],
    ['COLOR_DELTA_E_THRESHOLD', 'NaN'],
    ['COLOR_DELTA_E_THRESHOLD', '3junk'],
  ])('rejects invalid numeric environment value %s=%s', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow();
  });

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
