/**
 * Unit tests for diff scoring and patch hint generation
 */

import { describe, expect, test as it } from 'bun:test';
import { calculatePriorityScore, generatePatchHints } from './scoring';

describe('calculatePriorityScore', () => {
  it('should score layout property diffs highly', () => {
    const propDiffs = {
      display: {
        actual: 'block',
        expected: 'flex',
        delta: 1,
        unit: 'categorical',
      },
      gap: {
        actual: '0px',
        expected: '16px',
        delta: 16,
        unit: 'px',
      },
    };

    const score = calculatePriorityScore(propDiffs, 'medium', undefined);

    // Layout diffs (2 props) + medium severity should yield high score
    expect(score).toBeGreaterThanOrEqual(35); // 20 + 10 (layout) + 10 (severity)
  });

  it('should boost interactive elements with background-color diffs', () => {
    const propDiffs = {
      'background-color': {
        actual: 'rgb(255, 255, 255)',
        expected: 'rgb(0, 120, 212)',
        delta: 45.2,
        unit: 'ΔE',
      },
    };

    const scoreNormal = calculatePriorityScore(propDiffs, 'medium', {
      tag: 'div',
      elementKind: 'container',
    });

    const scoreInteractive = calculatePriorityScore(propDiffs, 'medium', {
      tag: 'button',
      elementKind: 'interactive',
    });

    // Interactive elements should get +15 bonus
    expect(scoreInteractive).toBeGreaterThan(scoreNormal);
    expect(scoreInteractive - scoreNormal).toBeGreaterThanOrEqual(15);
  });

  it('should prioritize large prominent elements', () => {
    const propDiffs = {
      'font-size': {
        actual: '32px',
        expected: '36px',
        delta: 4,
        unit: 'px',
      },
    };

    const scoreSmall = calculatePriorityScore(propDiffs, 'low', {
      tag: 'span',
      height: 20,
    });

    const scoreLarge = calculatePriorityScore(propDiffs, 'low', {
      tag: 'h1',
      height: 120,
    });

    // Large prominent elements should score higher
    expect(scoreLarge).toBeGreaterThan(scoreSmall);
  });

  it('should boost token-based diffs', () => {
    const propDiffs = {
      color: {
        actual: 'rgb(100, 100, 100)',
        expected: 'rgb(51, 51, 51)',
        expectedToken: '--color-text-primary',
        delta: 15.3,
        unit: 'ΔE',
      },
      'background-color': {
        actual: 'rgb(255, 255, 255)',
        expected: 'rgb(240, 240, 240)',
        expectedToken: '--color-bg-subtle',
        delta: 5.1,
        unit: 'ΔE',
      },
    };

    const scoreWithTokens = calculatePriorityScore(propDiffs, 'medium', undefined);

    const propDiffsNoTokens = {
      color: {
        actual: 'rgb(100, 100, 100)',
        expected: 'rgb(51, 51, 51)',
        delta: 15.3,
        unit: 'ΔE',
      },
      'background-color': {
        actual: 'rgb(255, 255, 255)',
        expected: 'rgb(240, 240, 240)',
        delta: 5.1,
        unit: 'ΔE',
      },
    };

    const scoreNoTokens = calculatePriorityScore(propDiffsNoTokens, 'medium', undefined);

    // Token diffs should get bonus points
    expect(scoreWithTokens).toBeGreaterThan(scoreNoTokens);
  });

  it('should never exceed 100 points', () => {
    const massiveDiffs = {
      display: { actual: 'block', expected: 'flex', delta: 1, unit: 'categorical' },
      'flex-direction': { actual: 'row', expected: 'column', delta: 1, unit: 'categorical' },
      gap: { actual: '0px', expected: '24px', delta: 24, unit: 'px' },
      'padding-top': { actual: '0px', expected: '32px', delta: 32, unit: 'px' },
      width: { actual: '200px', expected: '400px', delta: 200, unit: 'px' },
      height: { actual: '100px', expected: '300px', delta: 200, unit: 'px' },
      color: {
        actual: 'rgb(0, 0, 0)',
        expected: 'rgb(255, 255, 255)',
        expectedToken: '--color-text',
        delta: 100,
        unit: 'ΔE',
      },
      'background-color': {
        actual: 'rgb(255, 255, 255)',
        expected: 'rgb(0, 0, 0)',
        expectedToken: '--color-bg',
        delta: 100,
        unit: 'ΔE',
      },
    };

    const score = calculatePriorityScore(massiveDiffs, 'high', {
      tag: 'button',
      elementKind: 'interactive',
      height: 200,
    });

    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('generatePatchHints', () => {
  it('should generate hints for color diffs', () => {
    const propDiffs = {
      color: {
        actual: 'rgb(100, 100, 100)',
        expected: 'rgb(51, 51, 51)',
        delta: 15.3,
        unit: 'ΔE',
      },
    };

    const hints = generatePatchHints(propDiffs);

    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({
      property: 'color',
      suggestedValue: 'rgb(51, 51, 51)',
      severity: expect.stringMatching(/^(low|medium|high)$/) as string,
    });
  });

  it('should prefer tokens for color properties', () => {
    const propDiffs = {
      'background-color': {
        actual: 'rgb(255, 255, 255)',
        expected: '#f0f0f0',
        expectedToken: '--color-bg-subtle',
        delta: 5.1,
        unit: 'ΔE',
      },
    };

    const hints = generatePatchHints(propDiffs);

    expect(hints).toHaveLength(1);
    expect(hints[0].suggestedValue).toBe('var(--color-bg-subtle)');
  });

  it('should classify severity based on delta', () => {
    const highColorDiff = {
      color: {
        actual: 'rgb(0, 0, 0)',
        expected: 'rgb(255, 255, 255)',
        delta: 100,
        unit: 'ΔE',
      },
    };

    const mediumColorDiff = {
      color: {
        actual: 'rgb(100, 100, 100)',
        expected: 'rgb(120, 120, 120)',
        delta: 5,
        unit: 'ΔE',
      },
    };

    const lowColorDiff = {
      color: {
        actual: 'rgb(100, 100, 100)',
        expected: 'rgb(102, 102, 102)',
        delta: 1.5,
        unit: 'ΔE',
      },
    };

    expect(generatePatchHints(highColorDiff)[0].severity).toBe('high');
    expect(generatePatchHints(mediumColorDiff)[0].severity).toBe('medium');
    expect(generatePatchHints(lowColorDiff)[0].severity).toBe('low');
  });

  it('should classify layout categorical diffs as high severity', () => {
    const propDiffs = {
      display: {
        actual: 'block',
        expected: 'flex',
        delta: 1,
        unit: 'categorical',
      },
      'flex-direction': {
        actual: 'row',
        expected: 'column',
        delta: 1,
        unit: 'categorical',
      },
    };

    const hints = generatePatchHints(propDiffs);

    expect(hints).toHaveLength(2);
    hints.forEach((hint) => {
      expect(hint.severity).toBe('high');
    });
  });

  it('should exclude auxiliary properties', () => {
    const propDiffs = {
      'box-shadow': {
        actual: '0px 2px 4px rgba(0,0,0,0.1)',
        expected: '0px 4px 8px rgba(0,0,0,0.2)',
        delta: 2.5,
        unit: 'ΔE',
      },
      'box-shadow-offset-x': {
        actual: '0px',
        expected: '0px',
        delta: 0,
        unit: 'px',
      },
      'box-shadow-offset-y': {
        actual: '2px',
        expected: '4px',
        delta: 2,
        unit: 'px',
      },
    };

    const hints = generatePatchHints(propDiffs);

    // Should only include box-shadow, not auxiliary offset properties
    expect(hints).toHaveLength(1);
    expect(hints[0].property).toBe('box-shadow');
  });

  it('should skip properties without expected values', () => {
    const propDiffs = {
      color: {
        actual: 'rgb(100, 100, 100)',
        // No expected value
      },
      'background-color': {
        actual: 'rgb(255, 255, 255)',
        expected: 'rgb(240, 240, 240)',
        delta: 5,
        unit: 'ΔE',
      },
    };

    const hints = generatePatchHints(propDiffs);

    // Should only include background-color
    expect(hints).toHaveLength(1);
    expect(hints[0].property).toBe('background-color');
  });
});
