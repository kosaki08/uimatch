/**
 * Regression tests for selector-anchors package
 *
 * Ensures critical behaviors remain stable across updates
 */

import { describe, expect, test } from 'bun:test';
import { matchAnchors } from '../matching/anchor-matcher.js';
import type { SelectorAnchor } from '../types/schema.js';

describe('Regression Tests', () => {
  describe('ID scoring (no false positives)', () => {
    test('does not award ID points for href="#foo"', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor1',
          source: { file: 'test.ts', line: 1, col: 0 },
          hint: { prefer: ['css'] },
          lastKnown: {
            selector: '[href="#foo"]',
            timestamp: new Date().toISOString(),
            stabilityScore: 80,
          },
        },
      ];

      const results = matchAnchors(anchors, '[href="#foo"]');
      const score = results[0]?.score ?? 0;

      // Should get points for exact match (100) + stability (15) + recent (5) = 120
      // The key is that it doesn't get EXTRA ID points beyond what's expected
      expect(score).toBe(120); // Exact expected score without ID bonus
      expect(results[0]?.reasons).not.toContain(expect.stringContaining('Matches id'));
    });

    test('awards ID points correctly for #real-id selector', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor1',
          source: { file: 'test.ts', line: 1, col: 0 },
          hint: { prefer: ['css'] },
          lastKnown: {
            selector: '#real-id',
            timestamp: new Date().toISOString(),
            stabilityScore: 80,
          },
        },
      ];

      const results = matchAnchors(anchors, '#real-id');
      const score = results[0]?.score ?? 0;

      // Should get: exact match (100) + stability (15) = 115
      expect(score).toBeGreaterThanOrEqual(115);
    });
  });

  describe('Selector prefix compatibility', () => {
    test('matches testid: prefix in hint', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor1',
          source: { file: 'test.ts', line: 1, col: 0 },
          hint: { testid: 'submit-button', prefer: ['testid'] },
        },
      ];

      const results = matchAnchors(anchors, '[data-testid="submit-button"]');
      const score = results[0]?.score ?? 0;

      // Should award testid hint match points (80)
      expect(score).toBeGreaterThanOrEqual(80);
      expect(results[0]?.reasons).toContain('Matches testid hint');
    });

    test('matches role: prefix in hint', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor1',
          source: { file: 'test.ts', line: 1, col: 0 },
          hint: { role: 'button', prefer: ['role'] },
        },
      ];

      const results = matchAnchors(anchors, '[role="button"]');
      const score = results[0]?.score ?? 0;

      // Should award role hint match points (70)
      expect(score).toBeGreaterThanOrEqual(70);
      expect(results[0]?.reasons).toContain('Matches role hint');
    });

    test('handles component metadata matching', () => {
      const anchors: SelectorAnchor[] = [
        {
          id: 'anchor1',
          source: { file: 'test.ts', line: 1, col: 0 },
          hint: { prefer: ['css'] },
          meta: { component: 'SubmitButton' },
        },
      ];

      // Use a selector that clearly contains the component name
      const results = matchAnchors(anchors, '[data-component="submit-button"]');
      const score = results[0]?.score ?? 0;

      // Should get component metadata match (12) with reduced weight for precision
      expect(score).toBeGreaterThanOrEqual(12);
      expect(results[0]?.reasons).toContain('Matches component metadata');
    });
  });

  describe('Configuration environment variables', () => {
    test('UIMATCH_SNIPPET_MAX_RADIUS affects search radius', async () => {
      // Save original env
      const originalRadius = process.env.UIMATCH_SNIPPET_MAX_RADIUS;

      try {
        // Set test value
        process.env.UIMATCH_SNIPPET_MAX_RADIUS = '100';

        const { getConfig } = await import('../types/config.js');

        const config = getConfig();
        expect(config.snippet.maxRadius).toBe(100);
      } finally {
        // Restore
        if (originalRadius) {
          process.env.UIMATCH_SNIPPET_MAX_RADIUS = originalRadius;
        } else {
          delete process.env.UIMATCH_SNIPPET_MAX_RADIUS;
        }
      }
    });

    test('UIMATCH_SNIPPET_HIGH_CONFIDENCE affects early exit threshold', async () => {
      const originalThreshold = process.env.UIMATCH_SNIPPET_HIGH_CONFIDENCE;

      try {
        process.env.UIMATCH_SNIPPET_HIGH_CONFIDENCE = '0.95';

        const { getConfig } = await import('../types/config.js');

        const config = getConfig();
        expect(config.snippet.highConfidence).toBe(0.95);
      } finally {
        if (originalThreshold) {
          process.env.UIMATCH_SNIPPET_HIGH_CONFIDENCE = originalThreshold;
        } else {
          delete process.env.UIMATCH_SNIPPET_HIGH_CONFIDENCE;
        }
      }
    });

    test('UIMATCH_SNIPPET_FUZZY_THRESHOLD affects fuzzy matching', async () => {
      const originalThreshold = process.env.UIMATCH_SNIPPET_FUZZY_THRESHOLD;

      try {
        process.env.UIMATCH_SNIPPET_FUZZY_THRESHOLD = '0.60';

        const { getConfig } = await import('../types/config.js');

        const config = getConfig();
        expect(config.snippet.fuzzyThreshold).toBe(0.6);
      } finally {
        if (originalThreshold) {
          process.env.UIMATCH_SNIPPET_FUZZY_THRESHOLD = originalThreshold;
        } else {
          delete process.env.UIMATCH_SNIPPET_FUZZY_THRESHOLD;
        }
      }
    });

    test('invalid threshold values use defaults with warning', async () => {
      const originalThreshold = process.env.UIMATCH_SNIPPET_FUZZY_THRESHOLD;

      try {
        process.env.UIMATCH_SNIPPET_FUZZY_THRESHOLD = '1.5'; // Invalid: > 1.0

        const { getConfig, DEFAULT_SNIPPET_CONFIG } = await import('../types/config.js');

        const config = getConfig();
        // Should fallback to default
        expect(config.snippet.fuzzyThreshold).toBe(DEFAULT_SNIPPET_CONFIG.FUZZY_THRESHOLD);
      } finally {
        if (originalThreshold) {
          process.env.UIMATCH_SNIPPET_FUZZY_THRESHOLD = originalThreshold;
        } else {
          delete process.env.UIMATCH_SNIPPET_FUZZY_THRESHOLD;
        }
      }
    });
  });

  describe('AST timeout configuration', () => {
    test('UIMATCH_AST_FAST_PATH_TIMEOUT_MS is respected', async () => {
      const originalTimeout = process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS;

      try {
        process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = '500';

        const { getConfig } = await import('../types/config.js');

        const config = getConfig();
        expect(config.timeouts.astFastPath).toBe(500);
      } finally {
        if (originalTimeout) {
          process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = originalTimeout;
        } else {
          delete process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS;
        }
      }
    });
  });
});
