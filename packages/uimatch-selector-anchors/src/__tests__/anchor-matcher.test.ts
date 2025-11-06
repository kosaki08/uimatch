import { describe, expect, test } from 'bun:test';
import { matchAnchors, selectBestAnchor, type AnchorScore } from '../matching/anchor-matcher';
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

      const results: AnchorScore[] = matchAnchors(anchors, '[data-testid="submit"]');

      expect(results).toHaveLength(2);
      const firstResult: AnchorScore | undefined = results[0];
      const secondResult: AnchorScore | undefined = results[1];
      expect(firstResult).toBeDefined();
      if (firstResult && secondResult) {
        expect(firstResult.anchor.id).toBe('anchor-1');
        expect(firstResult.score).toBeGreaterThan(secondResult.score);
        expect(firstResult.reasons).toContain('Exact match with last known selector');
      }
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

      const results: AnchorScore[] = matchAnchors(anchors, '[data-testid="submit-btn"]');

      const firstResult: AnchorScore | undefined = results[0];
      expect(firstResult).toBeDefined();
      if (firstResult) {
        expect(firstResult.anchor.id).toBe('anchor-1');
        expect(firstResult.reasons).toContain('Matches testid hint');
      }
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

      const results: AnchorScore[] = matchAnchors(anchors, '[role="button"]');

      const firstResult: AnchorScore | undefined = results[0];
      expect(firstResult).toBeDefined();
      if (firstResult) {
        expect(firstResult.anchor.id).toBe('anchor-1');
        expect(firstResult.reasons).toContain('Matches role hint');
      }
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

      const results: AnchorScore[] = matchAnchors(anchors, '.submit-button');

      const firstResult: AnchorScore | undefined = results[0];
      expect(firstResult).toBeDefined();
      if (firstResult) {
        expect(firstResult.anchor.id).toBe('anchor-1');
        expect(firstResult.reasons).toContain('Matches component metadata');
      }
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

      const results: AnchorScore[] = matchAnchors(anchors, '.some-selector');

      const firstResult: AnchorScore | undefined = results[0];
      expect(firstResult).toBeDefined();
      if (firstResult) {
        expect(firstResult.anchor.id).toBe('anchor-1');
        expect(firstResult.reasons).toContain('Has snippet hash for robust tracking');
      }
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

      const results: AnchorScore[] = matchAnchors(anchors, '.some-selector');

      const firstResult: AnchorScore | undefined = results[0];
      expect(firstResult).toBeDefined();
      if (firstResult) {
        expect(firstResult.anchor.id).toBe('anchor-1');
        expect(firstResult.reasons).toContain('Recently verified selector');
      }
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

      const results: AnchorScore[] = matchAnchors(anchors, '.some-selector');

      const firstResult: AnchorScore | undefined = results[0];
      expect(firstResult).toBeDefined();
      if (firstResult) {
        expect(firstResult.anchor.id).toBe('anchor-1');
        expect(firstResult.reasons).toContain('High stability score from previous resolution');
      }
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

      const results: AnchorScore[] = matchAnchors(anchors, '[data-testid="submit"]');

      const firstResult: AnchorScore | undefined = results[0];
      expect(firstResult).toBeDefined();
      if (firstResult) {
        expect(firstResult.anchor.id).toBe('anchor-high');
        expect(firstResult.score).toBeGreaterThan(100); // Should have multiple bonuses
        expect(firstResult.reasons.length).toBeGreaterThan(2);
      }
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

      const result: AnchorScore | null = selectBestAnchor(anchors, '[data-testid="submit"]');

      expect(result).not.toBeNull();
      if (result) {
        expect(result.anchor.id).toBe('anchor-1');
      }
    });

    test('returns null for empty anchors', () => {
      const result: AnchorScore | null = selectBestAnchor([], '.some-selector');
      expect(result).toBeNull();
    });

    test('returns null when score below minScore threshold', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor-1',
          source: { file: 'test.tsx', line: 10, col: 0 },
        },
      ];

      const result: AnchorScore | null = selectBestAnchor(anchors, '.some-selector', 50);
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

      const result: AnchorScore | null = selectBestAnchor(anchors, '[data-testid="submit"]', 50);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.anchor.id).toBe('anchor-1');
      }
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
      const results: AnchorScore[] = matchAnchors(anchors, '.submit-button');

      const firstResult: AnchorScore | undefined = results[0];
      expect(firstResult).toBeDefined();
      if (firstResult) {
        expect(firstResult.anchor.id).toBe('anchor-1');
        expect(firstResult.reasons).toContain('Matches component metadata');
      }
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
      const results1: AnchorScore[] = matchAnchors(anchors, '[data-attribute="value"]');
      const firstResult1: AnchorScore | undefined = results1[0];
      if (firstResult1) {
        expect(firstResult1.reasons).not.toContain('Matches component metadata');
      }

      // Should match "button" at word boundary
      const results2: AnchorScore[] = matchAnchors(anchors, '.primary-button');
      const firstResult2: AnchorScore | undefined = results2[0];
      expect(firstResult2).toBeDefined();
      if (firstResult2) {
        expect(firstResult2.reasons).toContain('Matches component metadata');
      }
    });
  });
});
