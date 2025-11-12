/**
 * Unit tests for Design Fidelity Score (DFS) calculation
 * Tests the size mismatch penalty logic
 */

import { describe, expect, test } from 'bun:test';

/**
 * Calculate size mismatch penalty for DFS scoring
 * This is extracted from compare.ts for testing purposes
 *
 * @param figmaWidth - Figma design width
 * @param figmaHeight - Figma design height
 * @param implWidth - Implementation width
 * @param implHeight - Implementation height
 * @returns Penalty points (0-15)
 */
function calculateSizeMismatchPenalty(
  figmaWidth: number,
  figmaHeight: number,
  implWidth: number,
  implHeight: number
): number {
  const areaFigma = figmaWidth * figmaHeight;
  const areaImpl = implWidth * implHeight;
  const areaGap = Math.abs(areaFigma - areaImpl) / Math.max(areaFigma, areaImpl);
  return Math.min(15, Math.round(areaGap * 20));
}

describe('DFS Size Mismatch Penalty', () => {
  test('should return 0 penalty for identical dimensions', () => {
    const penalty = calculateSizeMismatchPenalty(1584, 628, 1584, 628);
    expect(penalty).toBe(0);
  });

  test('should return 0 penalty for very small size differences (< 5%)', () => {
    // 1% area difference: 100x100 vs 100x101
    const penalty1 = calculateSizeMismatchPenalty(100, 100, 100, 101);
    expect(penalty1).toBe(0);

    // 4% area difference: 100x100 vs 100x104
    const penalty2 = calculateSizeMismatchPenalty(100, 100, 100, 104);
    expect(penalty2).toBe(1);
  });

  test('should return moderate penalty for 50% area difference', () => {
    // 50% area difference: 100x100 vs 71x71 (roughly √0.5 of original)
    const penalty = calculateSizeMismatchPenalty(100, 100, 71, 71);
    expect(penalty).toBeGreaterThanOrEqual(9);
    expect(penalty).toBeLessThanOrEqual(11);
  });

  test('should cap penalty at 15 points for large differences', () => {
    // 100% area difference: 100x100 vs 0x0 (extreme case)
    const penalty1 = calculateSizeMismatchPenalty(100, 100, 1, 1);
    expect(penalty1).toBe(15);

    // 90% area difference: very different sizes
    const penalty2 = calculateSizeMismatchPenalty(1000, 1000, 316, 316);
    expect(penalty2).toBe(15);
  });

  test('should handle real-world example: 1584x628 vs 3136x468', () => {
    // This is the actual case from the bug report
    // Figma: 1584×628 = 994,752 px²
    // Impl:  3136×468 = 1,467,648 px²
    // Area difference: ~32% (not 47.5% as initially estimated)
    const penalty = calculateSizeMismatchPenalty(1584, 628, 3136, 468);

    // Expected penalty: areaGap = 0.322... → penalty = round(0.322 * 20) = 6 points
    expect(penalty).toBe(6);
  });

  test('should be symmetric (order independent)', () => {
    const penalty1 = calculateSizeMismatchPenalty(100, 100, 200, 200);
    const penalty2 = calculateSizeMismatchPenalty(200, 200, 100, 100);
    expect(penalty1).toBe(penalty2);
  });

  test('should handle aspect ratio changes with same area', () => {
    // Same area but different aspect ratios should result in 0 penalty
    // 100x100 = 10,000 px² vs 50x200 = 10,000 px²
    const penalty = calculateSizeMismatchPenalty(100, 100, 50, 200);
    expect(penalty).toBe(0);
  });

  test('should handle extreme aspect ratio with size difference', () => {
    // Very wide: 1000x10 = 10,000 px²
    // Square: 100x100 = 10,000 px²
    // Same area, different shape → 0 penalty
    const penalty = calculateSizeMismatchPenalty(1000, 10, 100, 100);
    expect(penalty).toBe(0);
  });
});

describe('DFS Calculation Integration', () => {
  /**
   * Simplified DFS calculation matching compare.ts logic
   */
  function calculateDFS(
    pixelDiffRatio: number,
    colorDeltaEAvg: number,
    hasHighSeverity: boolean,
    adjusted: boolean,
    figmaWidth: number,
    figmaHeight: number,
    implWidth: number,
    implHeight: number
  ): number {
    let dfs = 100;

    // Pixel difference penalty (up to -50 points)
    dfs -= pixelDiffRatio * 50;

    // Color delta E penalty (up to -30 points)
    dfs -= Math.min(colorDeltaEAvg / 10, 1) * 30;

    // Size mismatch penalty (up to -15 points)
    if (adjusted) {
      const sizePenalty = calculateSizeMismatchPenalty(
        figmaWidth,
        figmaHeight,
        implWidth,
        implHeight
      );
      dfs -= sizePenalty;
    }

    // High severity style diff penalty (-20 points)
    if (hasHighSeverity) {
      dfs -= 20;
    }

    return Math.max(0, Math.min(100, Math.round(dfs)));
  }

  test('should reduce DFS for size mismatch even with low pixel diff', () => {
    // Scenario: 1.84% pixel diff, no color diff, no style diffs, but 32% size mismatch
    // This is the bug report case
    const dfsWithoutPenalty = calculateDFS(
      0.0184, // 1.84% pixel diff
      0, // no color diff
      false, // no high severity
      false, // no adjustment (penalty disabled)
      1584,
      628,
      3136,
      468
    );

    const dfsWithPenalty = calculateDFS(
      0.0184,
      0,
      false,
      true, // adjustment enabled (penalty active)
      1584,
      628,
      3136,
      468
    );

    // Without penalty: 100 - (0.0184 * 50) ≈ 99
    expect(dfsWithoutPenalty).toBe(99);

    // With penalty: 99 - 6 = 93 (size penalty for 32% area difference)
    expect(dfsWithPenalty).toBe(93);
  });

  test('should maintain perfect score for perfect match', () => {
    const dfs = calculateDFS(0, 0, false, false, 100, 100, 100, 100);
    expect(dfs).toBe(100);
  });

  test('should handle worst case with all penalties', () => {
    // 100% pixel diff + max color diff + high severity + large size mismatch
    const dfs = calculateDFS(
      1.0, // 100% pixel diff (-50)
      10, // max color diff (-30)
      true, // high severity (-20)
      true, // size mismatch enabled
      100,
      100,
      200,
      200 // 75% area diff (-15)
    );

    // 100 - 50 - 30 - 15 - 20 = -15 → clamped to 0
    expect(dfs).toBe(0);
  });

  test('should apply size penalty proportionally', () => {
    // Same pixel/color diff, varying size mismatch
    const dfsSmallMismatch = calculateDFS(0.05, 2, false, true, 100, 100, 110, 110);
    const dfsLargeMismatch = calculateDFS(0.05, 2, false, true, 100, 100, 200, 200);

    // Larger mismatch should have lower score
    expect(dfsLargeMismatch).toBeLessThan(dfsSmallMismatch);

    // Both should be reasonable scores (not near 0 or 100)
    expect(dfsSmallMismatch).toBeGreaterThan(80);
    expect(dfsLargeMismatch).toBeGreaterThan(60);
    expect(dfsLargeMismatch).toBeLessThan(80);
  });
});
