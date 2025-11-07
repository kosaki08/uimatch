/**
 * Plugin definition and exports
 *
 * @module plugin
 */

import type { SelectorResolverPlugin } from '@uimatch/selector-spi';
import { performHealthCheck } from './core/health-check.js';
import { resolve } from './core/resolver.js';

/**
 * Selector Anchors Plugin
 *
 * Implements the SelectorResolverPlugin interface for uiMatch.
 * Provides AST-based selector resolution with snippet hash matching
 * and stability scoring.
 *
 * @example
 * ```typescript
 * import plugin from '@uimatch/selector-anchors';
 *
 * // Use the plugin with uiMatch
 * const result = await plugin.resolve({
 *   initialSelector: '[data-testid="button"]',
 *   anchorsPath: './anchors.json',
 *   probe: async (selector) => ({ isAlive: true, selector })
 * });
 *
 * // Check plugin health
 * const health = await plugin.healthCheck();
 * console.log(health.healthy ? 'Plugin ready' : 'Plugin issues');
 * ```
 */
const plugin: SelectorResolverPlugin = {
  /**
   * Plugin name
   */
  name: '@uimatch/selector-anchors',

  /**
   * Plugin version
   */
  version: '0.1.0',

  /**
   * Main resolve function
   *
   * @param context - Resolution context from uiMatch
   * @returns Resolution result with best selector found
   */
  resolve,

  /**
   * Health check function
   *
   * Validates that required dependencies (TypeScript) are available
   * and optional dependencies (parse5) are functioning correctly.
   *
   * @returns Health check result with status and any issues
   */
  async healthCheck() {
    return await performHealthCheck();
  },
};

/**
 * Default export for SPI compliance
 */
export default plugin;
