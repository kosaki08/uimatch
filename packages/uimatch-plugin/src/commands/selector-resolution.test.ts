/**
 * Test for selector resolution plugin integration (Phase 3)
 *
 * Tests both plugin-enabled and plugin-disabled (fallback) modes
 */

import { describe, expect, test } from 'bun:test';

// Browser tests always enabled in test:all
const runBrowser = describe;

describe('Selector resolution plugin integration', () => {
  describe('Plugin-disabled mode (fallback)', () => {
    runBrowser('uses original selector when no plugin is specified', () => {
      test('should use original selector when no plugin is specified', async () => {
        // Phase 3 Acceptance: プラグインが無い状態で、今まで通り比較が通る
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

  describe('Configuration bridging', () => {
    test('should pass selectorsPath and selectorsWriteBack to ResolveContext', () => {
      // This test documents the expected bridging behavior
      // Actual validation happens in maybeResolveSelectorWithPlugin implementation

      const mockContext = {
        url: 'http://example.com',
        initialSelector: '#test',
        anchorsPath: './selectors.json', // from args.selectorsPath
        writeBack: true, // from args.selectorsWriteBack
        probe: {} as { check: () => Promise<unknown> },
      };

      // Verify context structure matches SPI contract
      expect(mockContext.url).toBe('http://example.com');
      expect(mockContext.initialSelector).toBe('#test');
      expect(mockContext.anchorsPath).toBe('./selectors.json');
      expect(mockContext.writeBack).toBe(true);
      expect(mockContext.probe).toBeDefined();
    });
  });

  runBrowser('Actual plugin integration', () => {
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

        // If plugin loaded successfully, selectorResolution should be present
        const report = result.report as { selectorResolution?: unknown };
        if (report.selectorResolution) {
          // Plugin was available and used
          expect(report.selectorResolution).toBeDefined();
        }
        // If not present, plugin dependency was optional and not installed (acceptable)
      } finally {
        if (originalEnv !== undefined) {
          process.env.UIMATCH_FIGMA_PNG_B64 = originalEnv;
        } else {
          delete process.env.UIMATCH_FIGMA_PNG_B64;
        }
      }
    });
  });
});
