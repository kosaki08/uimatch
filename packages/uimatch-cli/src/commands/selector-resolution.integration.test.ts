/**
 * Test for selector resolution plugin integration (Phase 3)
 *
 * Tests both plugin-enabled and plugin-disabled (fallback) modes
 */

import { describe, expect, test } from 'vitest';

describe('Selector resolution plugin integration', () => {
  describe('Plugin-disabled mode (fallback)', () => {
    describe('uses original selector when no plugin is specified', () => {
      test('should use original selector when no plugin is specified', async () => {
        // Phase 3 Acceptance: Comparison should work as before when plugin is not available
        const { uiMatchCompare } = await import('./compare.js');

        // Mock minimal comparison (no actual browser needed for this test)
        const mockFigmaPng =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        // Set environment variable to bypass Figma fetch
        const originalEnv = process.env.UIMATCH_FIGMA_PNG_B64;
        process.env.UIMATCH_FIGMA_PNG_B64 = mockFigmaPng;

        try {
          // Call without selectorsPlugin or selectorsPath
          // Should fall back to original selector
          const result = await uiMatchCompare({
            figma: 'test:1-2',
            story:
              'data:text/html,<div id="test" style="width:1px;height:1px;background:red"></div>',
            selector: '#test',
            // No selectorsPlugin, no selectorsPath
            sizeMode: 'pad', // Handle dimension mismatch gracefully
          });

          // Should complete without error
          expect(result).toBeDefined();
          expect(result.summary).toBeDefined();

          // Should not have selectorResolution in report (plugin not used)
          expect(
            (result.report as { selectorResolution?: unknown }).selectorResolution
          ).toBeUndefined();
        } finally {
          // Restore environment
          if (originalEnv !== undefined) {
            process.env.UIMATCH_FIGMA_PNG_B64 = originalEnv;
          } else {
            delete process.env.UIMATCH_FIGMA_PNG_B64;
          }
        }
      });
    });
  });

  describe('Actual plugin integration', () => {
    test('should load and use @uimatch/selector-anchors when available', async () => {
      // Integration test with real plugin
      const { uiMatchCompare } = await import('./compare.js');

      const mockFigmaPng =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const originalEnv = process.env.UIMATCH_FIGMA_PNG_B64;
      process.env.UIMATCH_FIGMA_PNG_B64 = mockFigmaPng;

      try {
        const result = await uiMatchCompare({
          figma: 'test:1-2',
          story: 'data:text/html,<div id="test" style="width:1px;height:1px;background:red"></div>',
          selector: '#test',
          selectorsPlugin: '@uimatch/selector-anchors',
          sizeMode: 'pad',
        });

        expect(result).toBeDefined();

        const report = result.report as { selectorResolution?: unknown };
        expect(report.selectorResolution).toBeDefined();
      } finally {
        if (originalEnv !== undefined) {
          process.env.UIMATCH_FIGMA_PNG_B64 = originalEnv;
        } else {
          delete process.env.UIMATCH_FIGMA_PNG_B64;
        }
      }
    });

    test('rejects invalid plugin output instead of silently using the original selector', async () => {
      const { uiMatchCompare } = await import('./compare.js');
      const invalidPlugin = `data:text/javascript,${encodeURIComponent(`
        export default {
          name: 'invalid-plugin',
          version: '1.0.0',
          resolve: async () => ({ selector: '#test', stabilityScore: 101 })
        };
      `)}`;

      await expect(
        uiMatchCompare({
          figma: 'test:1-2',
          story: 'data:text/html,<div id="test"></div>',
          selector: '#test',
          selectorsPlugin: invalidPlugin,
        })
      ).rejects.toThrow('returned an invalid result');
    });

    test('rejects a configured plugin that cannot be loaded', async () => {
      const { uiMatchCompare } = await import('./compare.js');

      await expect(
        uiMatchCompare({
          figma: 'test:1-2',
          story: 'data:text/html,<div id="test"></div>',
          selector: '#test',
          selectorsPlugin: '@uimatch/plugin-that-does-not-exist',
        })
      ).rejects.toThrow('Failed to load selector plugin');
    });
  });
});
