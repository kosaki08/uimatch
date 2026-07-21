/**
 * Test for selector resolution plugin integration (Phase 3)
 *
 * Tests both plugin-enabled and plugin-disabled (fallback) modes
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  BROWSER_FIXTURE_VIEWPORT_SIZE,
  RED_10X10_PNG_B64,
  RED_TEST_STORY_URL,
} from '../../../../test-utils/browser-fixtures.js';

describe('Selector resolution plugin integration', () => {
  let originalFigmaPngB64: string | undefined;

  // Every case needs a reachable Figma source: uiMatchCompare validates that
  // before it resolves selectors, so without the bypass no plugin path runs.
  beforeEach(() => {
    originalFigmaPngB64 = process.env.UIMATCH_FIGMA_PNG_B64;
    process.env.UIMATCH_FIGMA_PNG_B64 = RED_10X10_PNG_B64;
  });

  afterEach(() => {
    if (originalFigmaPngB64 === undefined) {
      delete process.env.UIMATCH_FIGMA_PNG_B64;
    } else {
      process.env.UIMATCH_FIGMA_PNG_B64 = originalFigmaPngB64;
    }
  });

  describe('Plugin-disabled mode (fallback)', () => {
    test('should use original selector when no plugin is specified', async () => {
      // Phase 3 Acceptance: Comparison should work as before when plugin is not available
      const { uiMatchCompare } = await import('./compare.js');

      // Call without selectorsPlugin or selectorsPath
      // Should fall back to original selector
      const result = await uiMatchCompare({
        figma: 'test:1-2',
        story: RED_TEST_STORY_URL,
        selector: '#test',
        // No selectorsPlugin, no selectorsPath
        sizeMode: 'pad', // Handle dimension mismatch gracefully
        viewport: {
          width: BROWSER_FIXTURE_VIEWPORT_SIZE,
          height: BROWSER_FIXTURE_VIEWPORT_SIZE,
        },
      });

      // Should complete without error
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();

      // Should not have selectorResolution in report (plugin not used)
      expect(
        (result.report as { selectorResolution?: unknown }).selectorResolution
      ).toBeUndefined();
    });
  });

  describe('Actual plugin integration', () => {
    test('should load and use @uimatch/selector-anchors when available', async () => {
      // Integration test with real plugin
      const { uiMatchCompare } = await import('./compare.js');

      const result = await uiMatchCompare({
        figma: 'test:1-2',
        story: RED_TEST_STORY_URL,
        selector: '#test',
        selectorsPlugin: '@uimatch/selector-anchors',
        sizeMode: 'pad',
        viewport: {
          width: BROWSER_FIXTURE_VIEWPORT_SIZE,
          height: BROWSER_FIXTURE_VIEWPORT_SIZE,
        },
      });

      expect(result).toBeDefined();

      const report = result.report as { selectorResolution?: unknown };
      expect(report.selectorResolution).toBeDefined();
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

    test('applies the plugin deadline while loading the module', async () => {
      const { uiMatchCompare } = await import('./compare.js');
      const pendingPlugin = `data:text/javascript,${encodeURIComponent(
        'await new Promise(() => {}); export default {};'
      )}`;
      const startedAt = performance.now();

      await expect(
        uiMatchCompare({
          figma: 'test:1-2',
          story: 'data:text/html,<div id="test"></div>',
          selector: '#test',
          selectorsPlugin: pendingPlugin,
          selectorPluginTimeoutMs: 50,
        })
      ).rejects.toMatchObject({ name: 'SelectorPluginTimeoutError' });
      expect(performance.now() - startedAt).toBeLessThan(1_000);
    });

    test('rejects an out-of-range programmatic deadline before loading the module', async () => {
      const { uiMatchCompare } = await import('./compare.js');
      const pendingPlugin = `data:text/javascript,${encodeURIComponent(
        'await new Promise(() => {}); export default {};'
      )}`;

      await expect(
        uiMatchCompare({
          figma: 'test:1-2',
          story: 'data:text/html,<div id="test"></div>',
          selector: '#test',
          selectorsPlugin: pendingPlugin,
          selectorPluginTimeoutMs: 2_147_483_648,
        })
      ).rejects.toBeInstanceOf(RangeError);
    });
  });
});
