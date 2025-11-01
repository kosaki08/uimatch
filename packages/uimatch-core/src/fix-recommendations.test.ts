import { describe, expect, test } from 'bun:test';
import {
  formatRecommendationsAsMarkdown,
  generateFixRecommendations,
} from './core/fix-recommendations';
import type { StyleDiff } from './types/index';

describe('Fix Recommendations', () => {
  test('generates top fix recommendations sorted by priority', () => {
    const diffs: StyleDiff[] = [
      {
        selector: 'button',
        properties: {
          display: { actual: 'block', expected: 'flex', delta: 1, unit: 'categorical' },
          gap: { actual: '0px', expected: '8px', delta: 8, unit: 'px' },
        },
        severity: 'high',
        patchHints: [
          { property: 'display', suggestedValue: 'flex', severity: 'high' },
          { property: 'gap', suggestedValue: '8px', severity: 'medium' },
        ],
        meta: { tag: 'button', height: 50 },
        priorityScore: 75,
      },
      {
        selector: 'h1',
        properties: {
          'font-size': { actual: '24px', expected: '32px', delta: 8, unit: 'px' },
          color: {
            actual: '#000000',
            expected: 'var(--text-primary)',
            expectedToken: '--text-primary',
            delta: 0,
            unit: 'ΔE',
          },
        },
        severity: 'medium',
        patchHints: [
          { property: 'font-size', suggestedValue: '32px', severity: 'medium' },
          { property: 'color', suggestedValue: 'var(--text-primary)', severity: 'low' },
        ],
        meta: { tag: 'h1', height: 120 },
        priorityScore: 65,
      },
      {
        selector: 'span',
        properties: {
          color: { actual: '#666666', expected: '#777777', delta: 2, unit: 'ΔE' },
        },
        severity: 'low',
        patchHints: [{ property: 'color', suggestedValue: '#777777', severity: 'low' }],
        meta: { tag: 'span', height: 20 },
        priorityScore: 25,
      },
    ];

    const recommendations = generateFixRecommendations(diffs, 3);

    expect(recommendations.length).toBe(3);
    expect(recommendations[0]?.rank).toBe(1);
    expect(recommendations[0]?.selector).toBe('button');
    expect(recommendations[0]?.priorityScore).toBe(75);
    expect(recommendations[1]?.rank).toBe(2);
    expect(recommendations[1]?.selector).toBe('h1');
  });

  test('limits recommendations to maxRecommendations', () => {
    const diffs: StyleDiff[] = Array.from({ length: 10 }, (_, i) => ({
      selector: `div-${i}`,
      properties: {
        color: { actual: '#000000', expected: '#ffffff', delta: 10, unit: 'ΔE' },
      },
      severity: 'low' as const,
      patchHints: [],
      priorityScore: 10 - i,
    }));

    const recommendations = generateFixRecommendations(diffs, 5);

    expect(recommendations.length).toBe(5);
    expect(recommendations[0]?.rank).toBe(1);
    expect(recommendations[4]?.rank).toBe(5);
  });

  test('identifies token opportunities in fixes', () => {
    const diffs: StyleDiff[] = [
      {
        selector: 'div',
        properties: {
          color: {
            actual: '#ff0000',
            expected: 'var(--primary)',
            expectedToken: '--primary',
            delta: 5,
            unit: 'ΔE',
          },
        },
        severity: 'medium',
        patchHints: [{ property: 'color', suggestedValue: 'var(--primary)', severity: 'medium' }],
        priorityScore: 50,
      },
    ];

    const recommendations = generateFixRecommendations(diffs, 1);

    expect(recommendations[0]?.fixes[0]?.isToken).toBe(true);
    expect(recommendations[0]?.fixes[0]?.suggested).toBe('var(--primary)');
  });

  test('generates appropriate reasons for prioritization', () => {
    const diffs: StyleDiff[] = [
      {
        selector: 'button',
        properties: {
          display: { actual: 'block', expected: 'flex', delta: 1, unit: 'categorical' },
        },
        severity: 'high',
        patchHints: [],
        meta: { tag: 'button', height: 150 },
        priorityScore: 80,
      },
    ];

    const recommendations = generateFixRecommendations(diffs, 1);

    expect(recommendations[0]?.reason).toContain('layout-critical');
    expect(recommendations[0]?.reason).toContain('prominent-element');
    expect(recommendations[0]?.reason).toContain('large-element');
    expect(recommendations[0]?.reason).toContain('high-severity');
  });

  test('formats recommendations as markdown', () => {
    const diffs: StyleDiff[] = [
      {
        selector: 'button',
        properties: {
          gap: { actual: '0px', expected: '8px', delta: 8, unit: 'px' },
        },
        severity: 'medium',
        patchHints: [{ property: 'gap', suggestedValue: '8px', severity: 'medium' }],
        priorityScore: 60,
      },
    ];

    const recommendations = generateFixRecommendations(diffs, 1);
    const markdown = formatRecommendationsAsMarkdown(recommendations);

    expect(markdown).toContain('Priority Fix Recommendations');
    expect(markdown).toContain('1. `button`');
    expect(markdown).toContain('Priority: 60/100');
    expect(markdown).toContain('`gap`: `0px` → `8px`');
    expect(markdown).toContain('Total Estimated DFS Improvement');
  });

  test('handles empty diffs gracefully', () => {
    const recommendations = generateFixRecommendations([], 5);
    const markdown = formatRecommendationsAsMarkdown(recommendations);

    expect(recommendations.length).toBe(0);
    expect(markdown).toContain('No critical fixes needed');
  });
});
