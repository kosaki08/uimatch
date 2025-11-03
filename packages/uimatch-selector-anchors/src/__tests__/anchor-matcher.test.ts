import { describe, expect, test } from 'bun:test';
import { matchAnchors, selectBestAnchor } from '../matching/anchor-matcher';
import type { SelectorAnchor } from '../types/schema';

describe('Anchor Matcher', () => {
  describe('matchAnchors', () => {
    test('scores exact last known selector match highest', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          lastKnown: { selector: '[data-testid="submit"]' },
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
          lastKnown: { selector: '[data-testid="cancel"]' },
        },
      ];

      const results = matchAnchors(anchors, '[data-testid="submit"]');

      expect(results[0]?.anchor.id).toBe('anchor-1');
      expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
      expect(results[0]?.reasons).toContain('Exact match with last known selector');
    });

    test('scores testid hint match high', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          hint: { testid: 'submit-btn' },
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
          hint: { testid: 'cancel-btn' },
        },
      ];

      const results = matchAnchors(anchors, '[data-testid="submit-btn"]');

      expect(results[0]?.anchor.id).toBe('anchor-1');
      expect(results[0]?.reasons).toContain('Matches testid hint');
    });

    test('scores role hint match', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          hint: { role: 'button' },
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
          hint: { role: 'link' },
        },
      ];

      const results = matchAnchors(anchors, '[role="button"]');

      expect(results[0]?.anchor.id).toBe('anchor-1');
      expect(results[0]?.reasons).toContain('Matches role hint');
    });

    test('scores component metadata match', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          meta: { component: 'SubmitButton' },
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
          meta: { component: 'CancelButton' },
        },
      ];

      const results = matchAnchors(anchors, '.submit-button');

      expect(results[0]?.anchor.id).toBe('anchor-1');
      expect(results[0]?.reasons).toContain('Matches component metadata');
    });

    test('gives bonus for snippet hash', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          snippetHash: 'abc123',
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
        },
      ];

      const results = matchAnchors(anchors, '.some-selector');

      expect(results[0]?.anchor.id).toBe('anchor-1');
      expect(results[0]?.reasons).toContain('Has snippet hash for robust tracking');
    });

    test('gives bonus for recent timestamp', () => {
      const recentDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 1 day ago
      const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(); // 60 days ago

      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          lastKnown: { selector: '.btn', timestamp: recentDate },
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
          lastKnown: { selector: '.btn', timestamp: oldDate },
        },
      ];

      const results = matchAnchors(anchors, '.some-selector');

      expect(results[0]?.anchor.id).toBe('anchor-1');
      expect(results[0]?.reasons).toContain('Recently verified selector');
    });

    test('gives bonus for high stability score', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          lastKnown: { selector: '.btn', stabilityScore: 90 },
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
          lastKnown: { selector: '.btn', stabilityScore: 50 },
        },
      ];

      const results = matchAnchors(anchors, '.some-selector');

      expect(results[0]?.anchor.id).toBe('anchor-1');
      expect(results[0]?.reasons).toContain('High stability score from previous resolution');
    });

    test('combines multiple scoring factors', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-high',
          source: { file: 'test.tsx', line: 10, col: 0 },
          hint: { testid: 'submit' },
          snippetHash: 'abc123',
          lastKnown: {
            selector: '[data-testid="submit"]',
            stabilityScore: 95,
            timestamp: new Date().toISOString(),
          },
        },
        {
          id: 'anchor-low',
          source: { file: 'test.tsx', line: 20, col: 0 },
        },
      ];

      const results = matchAnchors(anchors, '[data-testid="submit"]');

      expect(results[0]?.anchor.id).toBe('anchor-high');
      expect(results[0]?.score).toBeGreaterThan(100); // Should have multiple bonuses
      expect(results[0]?.reasons.length).toBeGreaterThan(2);
    });
  });

  describe('selectBestAnchor', () => {
    test('returns best matching anchor', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          hint: { testid: 'submit' },
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
        },
      ];

      const result = selectBestAnchor(anchors, '[data-testid="submit"]');

      expect(result).not.toBeNull();
      expect(result?.anchor.id).toBe('anchor-1');
    });

    test('returns null for empty anchors', () => {
      const result = selectBestAnchor([], '.some-selector');
      expect(result).toBeNull();
    });

    test('returns null when score below minScore threshold', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
        },
      ];

      const result = selectBestAnchor(anchors, '.some-selector', 50);
      expect(result).toBeNull();
    });

    test('returns anchor when score meets minScore threshold', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          hint: { testid: 'submit' },
        },
      ];

      const result = selectBestAnchor(anchors, '[data-testid="submit"]', 50);
      expect(result).not.toBeNull();
      expect(result?.anchor.id).toBe('anchor-1');
    });

    test('matches component metadata with hyphenated names', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          meta: { component: 'SubmitButton' },
        },
        {
          id: 'anchor-2',
          source: { file: 'test.tsx', line: 20, col: 0 },
          meta: { component: 'CancelButton' },
        },
      ];

      // Test hyphenated CSS selector matching normalized component name
      const results = matchAnchors(anchors, '.submit-button');

      expect(results[0]?.anchor.id).toBe('anchor-1');
      expect(results[0]?.reasons).toContain('Matches component metadata');
    });

    test('component metadata matching respects word boundaries', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
          meta: { component: 'Button' },
        },
      ];

      // Should NOT match "but" in the middle of "attribute"
      const results1 = matchAnchors(anchors, '[data-attribute="value"]');
      expect(results1[0]?.reasons).not.toContain('Matches component metadata');

      // Should match "button" at word boundary
      const results2 = matchAnchors(anchors, '.primary-button');
      expect(results2[0]?.reasons).toContain('Matches component metadata');
    });
  });
});
