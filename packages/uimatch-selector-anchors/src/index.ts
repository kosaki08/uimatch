/**
 * @uimatch/selector-anchors
 *
 * Selector resolution plugin for uiMatch using AST-based anchors
 */

import type { Resolution, ResolveContext, SelectorResolverPlugin } from '@uimatch/selector-spi';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { resolveFromTypeScript } from './ast-resolver.js';
import { getConfig } from './config.js';
import { resolveFromHTML } from './html-resolver.js';
import { loadSelectorsAnchors } from './io.js';
import { checkLivenessAll } from './liveness.js';
import type { SelectorsAnchors } from './schema.js';
import { findSnippetMatch } from './snippet-hash.js';
import { calculateStabilityScore, findMostStableSelector } from './stability-score.js';

/**
 * Resolve project path relative to anchors file directory
 *
 * @param anchorsPath - Path to the anchors JSON file
 * @param file - Source file path (absolute or relative)
 * @returns Absolute path to the source file
 */
function resolveProjectPath(anchorsPath: string, file: string): string {
  if (isAbsolute(file)) {
    return file;
  }
  const anchorsDir = dirname(anchorsPath);
  return resolvePath(anchorsDir, file);
}

/**
 * Execute a promise with timeout protection
 * Returns null if the timeout is reached
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return await Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/**
 * Main resolve function implementing SPI contract
 *
 * This function integrates all the components:
 * 1. Load anchors JSON (if provided)
 * 2. Find matching anchor by snippet hash
 * 3. Resolve selectors from AST/HTML
 * 4. Check liveness and calculate stability
 * 5. Return the best selector
 *
 * @param context - Resolution context from uiMatch
 * @returns Resolution result
 */
async function resolve(context: ResolveContext): Promise<Resolution> {
  // Get configuration with environment variable overrides
  const config = getConfig();

  try {
    // If no anchors file provided, return initial selector
    if (!context.anchorsPath) {
      return {
        selector: context.initialSelector,
        reasons: ['No anchors file provided, using initial selector'],
      };
    }

    // Load anchors JSON
    let anchorsData: SelectorsAnchors;
    try {
      anchorsData = await loadSelectorsAnchors(context.anchorsPath);
    } catch (error) {
      return {
        selector: context.initialSelector,
        error: error instanceof Error ? error.message : String(error),
        reasons: ['Failed to load anchors file, using initial selector'],
      };
    }

    // For now, implement a basic passthrough that demonstrates the integration
    // Full implementation will be done in Phase 4
    const reasons: string[] = [];
    reasons.push(`Loaded ${anchorsData.anchors.length} anchors from ${context.anchorsPath}`);

    // If we have anchors, try to find the best match
    if (anchorsData.anchors.length > 0) {
      // Get the first anchor as a demo (Phase 4 will implement full matching logic)
      const anchor = anchorsData.anchors[0];
      if (!anchor) {
        return {
          selector: context.initialSelector,
          reasons: ['No valid anchors found, using initial selector'],
        };
      }

      reasons.push(`Found anchor: ${anchor.id}`);

      // Try to resolve from source file if snippet hash exists
      if (anchor.snippetHash && anchor.source) {
        const { file, line, col } = anchor.source;

        // Resolve source file path relative to anchors file
        const resolvedFile = resolveProjectPath(context.anchorsPath, file);

        // Check snippet hash match (fuzzy match if needed)
        try {
          const matchedLine = await findSnippetMatch(resolvedFile, anchor.snippetHash, line);

          if (matchedLine !== null) {
            reasons.push(`Snippet matched at line ${matchedLine}`);

            // Try AST resolution based on file extension with timeout protection
            let selectors: string[] = [];

            if (file.match(/\.(tsx?|jsx?)$/)) {
              const astResult = await withTimeout(
                resolveFromTypeScript(resolvedFile, matchedLine, col),
                config.timeouts.astParse
              );
              if (astResult) {
                selectors = astResult.selectors;
                reasons.push(
                  `AST resolution found ${selectors.length} selector candidates from TypeScript/JSX`
                );
              } else {
                reasons.push('AST resolution timed out or failed');
              }
            } else if (file.match(/\.html?$/)) {
              const htmlResult = await withTimeout(
                resolveFromHTML(resolvedFile, matchedLine, col),
                config.timeouts.htmlParse
              );
              if (htmlResult) {
                selectors = htmlResult.selectors;
                reasons.push(
                  `AST resolution found ${selectors.length} selector candidates from HTML`
                );
              } else {
                reasons.push('HTML resolution timed out or failed');
              }
            }

            // If we have selectors, check liveness for all and pick the best one
            if (selectors.length > 0) {
              // Check liveness for all candidates
              const livenessResults = await checkLivenessAll(context.probe, selectors, {
                timeoutMs: config.timeouts.probe, // Configurable timeout from environment
              });

              // Filter to only alive selectors and calculate stability scores
              const candidatesWithScores = livenessResults
                .filter((result) => result.isValid || result.isAlive)
                .map((livenessResult) => {
                  const stabilityScore = calculateStabilityScore({
                    selector: livenessResult.selector,
                    hint: anchor.hint,
                    snippetMatched: true,
                    livenessResult,
                  });

                  return {
                    selector: livenessResult.selector,
                    score: stabilityScore,
                    livenessResult,
                  };
                });

              if (candidatesWithScores.length > 0) {
                // Find the most stable selector
                const best = findMostStableSelector(candidatesWithScores);

                if (best) {
                  const stabilityScore = Math.round(best.score.overall * 100);
                  reasons.push(`Evaluated ${candidatesWithScores.length} live candidates`);
                  reasons.push(`Best selector: ${best.selector}`);
                  reasons.push(`Stability score: ${stabilityScore}%`);
                  reasons.push(...best.score.details);

                  // Prepare result
                  const result: Resolution = {
                    selector: best.selector,
                    stabilityScore,
                    reasons,
                  };

                  // Add subselector if present in anchor
                  if (anchor.subselector) {
                    result.subselector = anchor.subselector;
                    reasons.push(`Subselector: ${anchor.subselector}`);
                  }

                  // If writeBack is requested, prepare updated anchors structure
                  // but leave the actual file write to the host (caller)
                  if (context.writeBack) {
                    const updatedAnchors = {
                      ...anchorsData,
                      anchors: anchorsData.anchors.map((a) =>
                        a.id === anchor.id
                          ? {
                              ...a,
                              lastKnown: {
                                selector: best.selector,
                                stabilityScore,
                                timestamp: new Date().toISOString(),
                              },
                            }
                          : a
                      ),
                    };

                    result.updatedAnchors = updatedAnchors;
                    reasons.push('Prepared updated anchors (host will write to file)');
                  }

                  return result;
                }
              } else {
                reasons.push('Liveness check failed for all candidates');
              }
            }
          } else {
            reasons.push('Snippet hash did not match (code may have moved)');
          }
        } catch (error) {
          reasons.push(
            `Snippet resolution error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Fallback to last known selector if available
      if (anchor.lastKnown?.selector) {
        reasons.push(`Using last known selector: ${anchor.lastKnown.selector}`);
        return {
          selector: anchor.lastKnown.selector,
          stabilityScore: anchor.lastKnown.stabilityScore,
          reasons,
        };
      }
    }

    // Final fallback to initial selector
    reasons.push('Using initial selector (no better match found)');
    return {
      selector: context.initialSelector,
      reasons,
    };
  } catch (error) {
    return {
      selector: context.initialSelector,
      error: error instanceof Error ? error.message : String(error),
      reasons: ['Resolution failed with error, using initial selector'],
    };
  }
}

/**
 * Plugin implementation
 */
const plugin: SelectorResolverPlugin = {
  name: '@uimatch/selector-anchors',
  version: '0.1.0',
  resolve,

  async healthCheck() {
    // Basic health check - verify TypeScript and parse5 are available
    try {
      // Try to import dependencies
      await import('typescript');
      await import('parse5');

      return {
        healthy: true,
        message: 'Plugin is healthy and ready to use',
      };
    } catch (error) {
      return {
        healthy: false,
        message: 'Plugin dependencies are not available',
        issues: [error instanceof Error ? error.message : String(error)],
      };
    }
  },
};

// Default export for SPI compliance
export default plugin;

// Named exports for direct usage
export * from '@uimatch/selector-spi';
export * from './ast-resolver.js';
export * from './config.js';
export * from './html-resolver.js';
export * from './io.js';
export * from './liveness.js';
export * from './schema.js';
export * from './snippet-hash.js';
export * from './stability-score.js';
export { resolve };
