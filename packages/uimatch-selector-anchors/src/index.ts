/**
 * @uimatch/selector-anchors
 *
 * Selector resolution plugin for uiMatch using AST-based anchors
 */

import { resolveFromTypeScript } from './ast-resolver.js';
import { resolveFromHTML } from './html-resolver.js';
import { loadSelectorsAnchors } from './io.js';
import { checkLivenessPriority } from './liveness.js';
import type { SelectorsAnchors } from './schema.js';
import { findSnippetMatch } from './snippet-hash.js';
import type { Resolution, ResolveContext, SelectorResolverPlugin } from './spi.js';
import { calculateStabilityScore } from './stability-score.js';

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

        // Check snippet hash match (fuzzy match if needed)
        try {
          const matchedLine = await findSnippetMatch(file, anchor.snippetHash, line);

          if (matchedLine !== null) {
            reasons.push(`Snippet matched at line ${matchedLine}`);

            // Try AST resolution based on file extension
            let selectors: string[] = [];

            if (file.match(/\.(tsx?|jsx?)$/)) {
              const astResult = await resolveFromTypeScript(file, matchedLine, col);
              if (astResult) {
                selectors = astResult.selectors;
                reasons.push(
                  `AST resolution found ${selectors.length} selector candidates from TypeScript/JSX`
                );
              }
            } else if (file.match(/\.html?$/)) {
              const htmlResult = await resolveFromHTML(file, matchedLine, col);
              if (htmlResult) {
                selectors = htmlResult.selectors;
                reasons.push(
                  `AST resolution found ${selectors.length} selector candidates from HTML`
                );
              }
            }

            // If we have selectors, check liveness and pick the best one
            if (selectors.length > 0) {
              const livenessResult = await checkLivenessPriority(context.probe, selectors, {
                timeoutMs: 600, // Short timeout for probing
              });

              if (livenessResult && (livenessResult.isValid || livenessResult.isAlive)) {
                reasons.push(`Liveness check passed for: ${livenessResult.selector}`);

                // Calculate stability score
                const stabilityScore = calculateStabilityScore({
                  selector: livenessResult.selector,
                  hint: anchor.hint,
                  snippetMatched: true,
                  livenessResult,
                });

                reasons.push(`Stability score: ${(stabilityScore.overall * 100).toFixed(0)}%`);

                return {
                  selector: livenessResult.selector,
                  stabilityScore: stabilityScore.overall * 100, // Convert to 0-100 scale
                  reasons,
                };
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
export * from './ast-resolver.js';
export * from './html-resolver.js';
export * from './io.js';
export * from './liveness.js';
export * from './schema.js';
export * from './snippet-hash.js';
export * from './spi.js';
export * from './stability-score.js';
export { resolve };
