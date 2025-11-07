/**
 * @uimatch/selector-anchors
 *
 * Selector resolution plugin for uiMatch using AST-based anchors
 *
 * @example
 * ```typescript
 * import plugin from '@uimatch/selector-anchors';
 *
 * // Use the plugin
 * const result = await plugin.resolve({
 *   initialSelector: '[data-testid="button"]',
 *   anchorsPath: './anchors.json',
 *   probe: async (selector) => ({ isAlive: true, selector })
 * });
 * ```
 *
 * @module @uimatch/selector-anchors
 */

// Default plugin export
export { default } from './plugin.js';

// Re-export SPI types first
export * from '@uimatch/selector-spi';

// Re-export all core functionality (selective to avoid conflicts)
export { performHealthCheck } from './core/health-check.js';
export { isLive, resolve, resolveProjectPath } from './core/resolver.js';

// Re-export domain modules
export * from './hashing/snippet-hash.js';
export * from './hashing/stability-score.js';
export * from './matching/anchor-matcher.js';
export * from './resolvers/ast-resolver.js';
export * from './resolvers/fallback-selectors.js';
export * from './resolvers/html-resolver.js';
export * from './types/config.js';
export * from './types/schema.js';
export * from './utils/io.js';
export * from './utils/liveness.js';
