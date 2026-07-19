import type { CompareImageResult } from '@uimatch/core';
import { describe, expect, test } from 'vitest';
import { computeDFS } from './computeDFS';

function createResult(
  figma: { width: number; height: number },
  impl: { width: number; height: number }
): CompareImageResult {
  return {
    pixelDiffRatio: 0,
    diffPixelCount: 0,
    diffPngB64: '',
    totalPixels: 0,
    dimensions: {
      figma,
      impl,
      compared: {
        width: Math.max(figma.width, impl.width),
        height: Math.max(figma.height, impl.height),
      },
      sizeMode: 'pad',
      adjusted: true,
    },
  };
}

describe('computeDFS zero-area size penalty', () => {
  test('treats two zero-area images as having no area gap', () => {
    const result = computeDFS({
      result: createResult({ width: 0, height: 0 }, { width: 0, height: 0 }),
      styleDiffs: [],
    });

    expect(result.score).toBe(100);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  test('treats one zero-area image as the maximum area gap', () => {
    const result = computeDFS({
      result: createResult({ width: 0, height: 0 }, { width: 100, height: 100 }),
      styleDiffs: [],
    });

    expect(result.score).toBe(85);
    expect(Number.isFinite(result.score)).toBe(true);
  });
});
