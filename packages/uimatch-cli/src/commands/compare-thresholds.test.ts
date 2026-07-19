import { describe, expect, test } from 'vitest';
import { resolveColorDeltaEThresholds } from './comparison-thresholds.js';

describe('resolveColorDeltaEThresholds', () => {
  test('keeps project style and acceptance thresholds independent', () => {
    expect(
      resolveColorDeltaEThresholds(undefined, {
        colorDeltaEThreshold: 2,
        acceptanceColorDeltaE: 8,
      })
    ).toEqual({ style: 2, acceptance: 8 });
  });

  test('applies an explicit threshold to both stages for compatibility', () => {
    expect(
      resolveColorDeltaEThresholds(5, {
        colorDeltaEThreshold: 2,
        acceptanceColorDeltaE: 8,
      })
    ).toEqual({ style: 5, acceptance: 5 });
  });
});
