import type { ProbeResult } from '@uimatch/selector-spi';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  calculateStabilityScore,
  compareStabilityScores,
  findMostStableSelector,
  type StabilityScore,
} from '../hashing/stability-score.js';
import type { SelectorHint } from '../types/schema.js';

describe('calculateStabilityScore', () => {
  // Isolate tests from environment variables
  const saved = {
    H: process.env.UIMATCH_STABILITY_HINT_WEIGHT,
    S: process.env.UIMATCH_STABILITY_SNIPPET_WEIGHT,
    L: process.env.UIMATCH_STABILITY_LIVENESS_WEIGHT,
    P: process.env.UIMATCH_STABILITY_SPECIFICITY_WEIGHT,
  };

  beforeEach(() => {
    delete process.env.UIMATCH_STABILITY_HINT_WEIGHT;
    delete process.env.UIMATCH_STABILITY_SNIPPET_WEIGHT;
    delete process.env.UIMATCH_STABILITY_LIVENESS_WEIGHT;
    delete process.env.UIMATCH_STABILITY_SPECIFICITY_WEIGHT;
  });

  afterEach(() => {
    process.env.UIMATCH_STABILITY_HINT_WEIGHT = saved.H;
    process.env.UIMATCH_STABILITY_SNIPPET_WEIGHT = saved.S;
    process.env.UIMATCH_STABILITY_LIVENESS_WEIGHT = saved.L;
    process.env.UIMATCH_STABILITY_SPECIFICITY_WEIGHT = saved.P;
  });

  test('calculates score for testid selector', () => {
    const hint: SelectorHint = {
      prefer: ['testid'],
      testid: 'submit-button',
    };

    const livenessResult: ProbeResult = {
      selector: '[data-testid="submit-button"]',
      isValid: true,
      isAlive: true,
      checkTime: 50,
    };

    const score: StabilityScore = calculateStabilityScore({
      selector: '[data-testid="submit-button"]',
      hint,
      snippetMatched: true,
      livenessResult,
    });

    expect(score.overall).toBeGreaterThan(0.9); // Very stable
    expect(score.breakdown.hintQuality).toBe(1.0); // testid is top quality
    expect(score.breakdown.snippetMatch).toBe(1.0); // Snippet matched
    expect(score.breakdown.liveness).toBe(1.0); // Visible
    expect(score.breakdown.specificity).toBe(1.0); // data-testid is most specific
  });

  test('calculates score for role selector', () => {
    const hint: SelectorHint = {
      prefer: ['role'],
      role: 'button',
      ariaLabel: 'Submit',
    };

    const livenessResult: ProbeResult = {
      selector: 'role:button[name="Submit"]',
      isValid: true,
      isAlive: true,
      checkTime: 50,
    };

    const score: StabilityScore = calculateStabilityScore({
      selector: 'role:button[name="Submit"]',
      hint,
      snippetMatched: false,
      livenessResult,
    });

    expect(score.overall).toBeGreaterThan(0.7);
    expect(score.overall).toBeLessThan(0.9);
    expect(score.breakdown.hintQuality).toBe(0.8); // role quality
    expect(score.breakdown.snippetMatch).toBe(0.0); // Not matched
    expect(score.breakdown.liveness).toBe(1.0); // Visible
    expect(score.breakdown.specificity).toBe(0.9); // role with name
  });

  test('calculates score for css selector with low stability', () => {
    const hint: SelectorHint = {
      prefer: ['css'],
    };

    const livenessResult: ProbeResult = {
      selector: '.submit-btn',
      isValid: true,
      isAlive: true,
      checkTime: 50,
    };

    const score: StabilityScore = calculateStabilityScore({
      selector: '.submit-btn',
      hint,
      snippetMatched: false,
      livenessResult,
    });

    expect(score.overall).toBeLessThan(0.6);
    expect(score.breakdown.hintQuality).toBe(0.3); // css is least stable
    expect(score.breakdown.specificity).toBe(0.3); // class selector
  });

  test('penalizes hidden elements', () => {
    const hint: SelectorHint = {
      prefer: ['testid'],
      testid: 'hidden-element',
    };

    const livenessResult: ProbeResult = {
      selector: '[data-testid="hidden-element"]',
      isValid: false,
      isAlive: false,
      checkTime: 50,
    };

    const score: StabilityScore = calculateStabilityScore({
      selector: '[data-testid="hidden-element"]',
      hint,
      snippetMatched: true,
      livenessResult,
    });

    expect(score.breakdown.liveness).toBe(0.0); // Hidden elements are treated as not alive (isAlive=false → score=0.0)
    expect(score.overall).toBeLessThan(0.9); // Overall reduced
  });

  test('penalizes not found elements', () => {
    const hint: SelectorHint = {
      prefer: ['testid'],
      testid: 'non-existent',
    };

    const livenessResult: ProbeResult = {
      selector: '[data-testid="non-existent"]',
      isValid: false,
      isAlive: false,
      checkTime: 50,
    };

    const score: StabilityScore = calculateStabilityScore({
      selector: '[data-testid="non-existent"]',
      hint,
      snippetMatched: false,
      livenessResult,
    });

    expect(score.breakdown.liveness).toBe(0.0); // Not found penalty
    expect(score.overall).toBeLessThan(0.7);
  });

  test('handles missing hint with default score', () => {
    const score: StabilityScore = calculateStabilityScore({
      selector: '#some-id',
    });

    expect(score.breakdown.hintQuality).toBe(0.3); // Default for no hint
    expect(score.breakdown.snippetMatch).toBe(0.0); // Default for not matched
    expect(score.breakdown.liveness).toBe(0.5); // Default for no liveness check
    expect(score.breakdown.specificity).toBe(0.6); // ID selector
  });

  test('supports custom weights', () => {
    const hint: SelectorHint = {
      prefer: ['testid'],
    };

    const score: StabilityScore = calculateStabilityScore(
      {
        selector: '[data-testid="test"]',
        hint,
        snippetMatched: true,
        livenessResult: {
          selector: '[data-testid="test"]',
          isValid: true,
          isAlive: true,
          checkTime: 50,
        },
      },
      {
        weights: {
          hintQuality: 0.5,
          snippetMatch: 0.3,
          liveness: 0.1,
          specificity: 0.1,
        },
      }
    );

    // Custom weights should affect overall score
    const expectedOverall = 1.0 * 0.5 + 1.0 * 0.3 + 1.0 * 0.1 + 1.0 * 0.1;
    expect(score.overall).toBe(expectedOverall);
  });

  test('normalizes custom weights that do not sum to 1.0', () => {
    const hint: SelectorHint = {
      prefer: ['testid'],
    };

    // Provide weights that sum to 2.0 (not 1.0)
    const score: StabilityScore = calculateStabilityScore(
      {
        selector: '[data-testid="test"]',
        hint,
        snippetMatched: true,
        livenessResult: {
          selector: '[data-testid="test"]',
          isValid: true,
          isAlive: true,
          checkTime: 50,
        },
      },
      {
        weights: {
          hintQuality: 0.8, // Sum = 2.0
          snippetMatch: 0.6,
          liveness: 0.4,
          specificity: 0.2,
        },
      }
    );

    // After normalization: 0.8/2=0.4, 0.6/2=0.3, 0.4/2=0.2, 0.2/2=0.1
    // All components are 1.0, so overall = 0.4 + 0.3 + 0.2 + 0.1 = 1.0
    expect(score.overall).toBeCloseTo(1.0, 5);
  });

  test('normalizes partial custom weights with env defaults', () => {
    const hint: SelectorHint = {
      prefer: ['testid'],
    };

    // Only override hintQuality, others come from env (default: 0.4, 0.2, 0.3, 0.1)
    const score: StabilityScore = calculateStabilityScore(
      {
        selector: '[data-testid="test"]',
        hint,
        snippetMatched: true,
        livenessResult: {
          selector: '[data-testid="test"]',
          isValid: true,
          isAlive: true,
          checkTime: 50,
        },
      },
      {
        weights: {
          hintQuality: 0.8, // Merged sum: 0.8 + 0.2 + 0.3 + 0.1 = 1.4
        },
      }
    );

    // After normalization: 0.8/1.4≈0.571, 0.2/1.4≈0.143, 0.3/1.4≈0.214, 0.1/1.4≈0.071
    // All components are 1.0, so overall ≈ 0.571 + 0.143 + 0.214 + 0.071 ≈ 1.0
    expect(score.overall).toBeCloseTo(1.0, 5);
  });

  test('includes details in result', () => {
    const hint: SelectorHint = {
      prefer: ['role', 'css'],
      role: 'button',
    };

    const score: StabilityScore = calculateStabilityScore({
      selector: 'role:button',
      hint,
      snippetMatched: true,
    });

    expect(score.details).toBeDefined();
    expect(score.details.length).toBeGreaterThan(0);
    expect(score.details.some((d) => d.includes('Hint quality'))).toBe(true);
    expect(score.details.some((d) => d.includes('role > css'))).toBe(true);
  });

  test('recognizes ID in compound selectors', () => {
    // Test compound selectors with ID (e.g., button#submit, div#container)
    const compoundSelectors = ['button#submit', 'div#container', 'input#email-field'];

    for (const selector of compoundSelectors) {
      const score = calculateStabilityScore({ selector });
      expect(score.breakdown.specificity).toBe(0.6); // Should recognize as ID selector
    }
  });

  test('distinguishes simple ID from tag selector', () => {
    const idSelector = '#submit';
    const tagSelector = 'button';

    const idScore = calculateStabilityScore({ selector: idSelector });
    const tagScore = calculateStabilityScore({ selector: tagSelector });

    expect(idScore.breakdown.specificity).toBe(0.6); // ID specificity
    expect(tagScore.breakdown.specificity).toBe(0.2); // Tag specificity
  });
});

describe('compareStabilityScores', () => {
  test('compares two stability scores', () => {
    const scoreA: StabilityScore = {
      overall: 0.9,
      breakdown: { hintQuality: 1.0, snippetMatch: 1.0, liveness: 1.0, specificity: 1.0 },
      details: [],
    };

    const scoreB: StabilityScore = {
      overall: 0.7,
      breakdown: { hintQuality: 0.8, snippetMatch: 0.0, liveness: 1.0, specificity: 0.5 },
      details: [],
    };

    const result = compareStabilityScores(scoreA, scoreB);

    expect(result).toBeLessThan(0); // scoreA is more stable (returns negative)
  });

  test('returns zero for equal scores', () => {
    const scoreA: StabilityScore = {
      overall: 0.85,
      breakdown: { hintQuality: 0.8, snippetMatch: 1.0, liveness: 1.0, specificity: 0.7 },
      details: [],
    };

    const scoreB: StabilityScore = {
      overall: 0.85,
      breakdown: { hintQuality: 1.0, snippetMatch: 0.5, liveness: 1.0, specificity: 0.9 },
      details: [],
    };

    const result = compareStabilityScores(scoreA, scoreB);

    expect(result).toBe(0);
  });
});

describe('findMostStableSelector', () => {
  test('finds the most stable selector', () => {
    const scores = [
      {
        selector: '.css-class',
        score: {
          overall: 0.5,
          breakdown: { hintQuality: 0.3, snippetMatch: 0.0, liveness: 1.0, specificity: 0.3 },
          details: [],
        },
      },
      {
        selector: '[data-testid="best"]',
        score: {
          overall: 0.95,
          breakdown: { hintQuality: 1.0, snippetMatch: 1.0, liveness: 1.0, specificity: 1.0 },
          details: [],
        },
      },
      {
        selector: 'role:button',
        score: {
          overall: 0.75,
          breakdown: { hintQuality: 0.8, snippetMatch: 1.0, liveness: 1.0, specificity: 0.7 },
          details: [],
        },
      },
    ];

    const result = findMostStableSelector(scores);

    expect(result).not.toBeNull();
    expect(result?.selector).toBe('[data-testid="best"]');
    expect(result?.score.overall).toBe(0.95);
  });

  test('returns null for empty array', () => {
    const result = findMostStableSelector([]);

    expect(result).toBeNull();
  });

  test('handles single selector', () => {
    const scores = [
      {
        selector: '#only-one',
        score: {
          overall: 0.6,
          breakdown: { hintQuality: 0.5, snippetMatch: 0.0, liveness: 1.0, specificity: 0.6 },
          details: [],
        },
      },
    ];

    const result = findMostStableSelector(scores);

    expect(result).not.toBeNull();
    expect(result?.selector).toBe('#only-one');
  });
});
