/**
 * @uimatch/selector-anchors
 *
 * Selector resolution plugin for uiMatch using AST-based anchors
 */

import type { Resolution, ResolveContext, SelectorResolverPlugin } from '@uimatch/selector-spi';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { findSnippetMatch } from './hashing/snippet-hash.js';
import { calculateStabilityScore, findMostStableSelector } from './hashing/stability-score.js';
import { selectBestAnchor } from './matching/anchor-matcher.js';
import { resolveFromTypeScript } from './resolvers/ast-resolver.js';
import { getConfig } from './types/config.js';
import type { SelectorsAnchors } from './types/schema.js';
import { loadSelectorsAnchors } from './utils/io.js';
import { checkLivenessAll } from './utils/liveness.js';

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
 * Check if liveness result indicates the selector is alive
 * Supports both isAlive and isValid property names
 */
function isLive(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as { isAlive?: boolean; isValid?: boolean };
  return Boolean(r.isAlive ?? r.isValid);
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

    const reasons: string[] = [];
    reasons.push(`Loaded ${anchorsData.anchors.length} anchors from ${context.anchorsPath}`);

    // If we have anchors, try to find the best match
    if (anchorsData.anchors.length > 0) {
      // Select best matching anchor based on initialSelector
      const bestMatch = selectBestAnchor(anchorsData.anchors, context.initialSelector);

      if (!bestMatch) {
        return {
          selector: context.initialSelector,
          reasons: [
            'No valid anchors found matching the initial selector',
            'Using initial selector',
          ],
        };
      }

      const anchor = bestMatch.anchor;
      reasons.push(`Selected anchor: ${anchor.id} (score: ${bestMatch.score})`);
      reasons.push(...bestMatch.reasons);

      // Check if we have a cached resolvedCss selector
      if (anchor.resolvedCss) {
        reasons.push(`Using cached resolvedCss: ${anchor.resolvedCss}`);

        // Verify the cached selector is still alive
        const livenessResults = await checkLivenessAll(context.probe, [anchor.resolvedCss], {
          timeoutMs: config.timeouts.probe,
        });

        if (livenessResults.length > 0 && isLive(livenessResults[0])) {
          reasons.push('Cached selector is still alive');
          return {
            selector: anchor.resolvedCss,
            stabilityScore: anchor.lastKnown?.stabilityScore,
            reasons,
          };
        } else {
          reasons.push('Cached selector is no longer alive, re-resolving from source');
        }
      }

      // Try to resolve from source file if snippet hash exists
      if (anchor.snippetHash && anchor.source) {
        const { file, line, col } = anchor.source;

        // Resolve source file path relative to anchors file
        const resolvedFile = resolveProjectPath(context.anchorsPath, file);

        // Check snippet hash match (fuzzy match if needed)
        try {
          // If snippet and context are available, use them for fuzzy matching
          // Otherwise fallback to hash-only exact match
          const hashOrResult =
            anchor.snippet && anchor.snippetContext
              ? {
                  hash: anchor.snippetHash,
                  snippet: anchor.snippet,
                  startLine: Math.max(1, line - (anchor.snippetContext.contextBefore ?? 3)),
                  endLine: line + (anchor.snippetContext.contextAfter ?? 3),
                }
              : anchor.snippetHash;

          const matchedLine = await findSnippetMatch(resolvedFile, hashOrResult, line, {
            contextBefore: anchor.snippetContext?.contextBefore ?? 3,
            contextAfter: anchor.snippetContext?.contextAfter ?? 3,
            timeoutMs: config.timeouts.snippetMatch,
          });

          if (matchedLine !== null) {
            reasons.push(`Snippet matched at line ${matchedLine}`);

            // Try AST resolution based on file extension
            // Note: resolveFromTypeScript now has internal tiered fallback with timeouts
            let selectors: string[] = [];

            if (file.match(/\.(tsx?|jsx?)$/)) {
              // resolveFromTypeScript handles its own tiered timeout strategy:
              // 1. Fast path - critical attributes only
              // 2. Attribute-only - all attributes
              // 3. Full parse - including text content
              // 4. Heuristics - regex-based fallback
              const astResult = await resolveFromTypeScript(resolvedFile, matchedLine, col, {
                fastPath: config.timeouts.astFastPath,
                attr: config.timeouts.astAttr,
                full: config.timeouts.astFull,
              });

              if (astResult) {
                selectors = astResult.selectors;
                reasons.push(
                  `AST resolution found ${selectors.length} selector candidates from TypeScript/JSX`
                );
              } else {
                reasons.push('AST resolution failed completely (all fallback levels exhausted)');
              }
            } else if (file.match(/\.html?$/)) {
              // Lazy import HTML resolver to avoid parse5 dependency at module load time
              const { resolveFromHTML } = await import('./resolvers/html-resolver.js');
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
              const candidatesWithScores = livenessResults.filter(isLive).map((livenessResult) => {
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

                  // If writeBack is requested, handle anchor updates
                  if (context.writeBack && context.anchorsPath) {
                    const updatedAnchors = {
                      ...anchorsData,
                      anchors: anchorsData.anchors.map((a) =>
                        a.id === anchor.id
                          ? {
                              ...a,
                              resolvedCss: best.selector,
                              lastSeen: new Date().toISOString(),
                              // Note: write-back now only updates resolvedCss/lastSeen
                            }
                          : a
                      ),
                    };

                    // If postWrite hook is provided, use it to persist changes
                    const postWriteFn = context.postWrite as
                      | ((path: string, anchors: object) => Promise<void>)
                      | undefined;
                    if (postWriteFn) {
                      try {
                        await postWriteFn(context.anchorsPath, updatedAnchors);
                        reasons.push('Updated anchors persisted via postWrite hook');
                      } catch (err) {
                        reasons.push(
                          `postWrite hook failed: ${err instanceof Error ? err.message : String(err)}`
                        );
                        // Still include updatedAnchors for fallback
                        result.updatedAnchors = updatedAnchors;
                      }
                    } else {
                      // No postWrite hook provided, prepare updatedAnchors for host to handle
                      result.updatedAnchors = updatedAnchors;
                      reasons.push('Prepared updated anchors (host will write to file)');
                    }
                  }

                  return result;
                }
              } else {
                reasons.push('Liveness check failed for all candidates');

                // Fallback strategies
                if (anchor.fallbacks || anchor.hints) {
                  reasons.push('Primary selectors failed, trying fallback strategies');
                  const { generateFallbackSelectors } = await import(
                    './resolvers/fallback-selectors.js'
                  );

                  const fallbackResult = generateFallbackSelectors(
                    anchor.fallbacks ?? {},
                    anchor.hints ?? {}
                  );

                  if (fallbackResult.selectors.length > 0) {
                    reasons.push(...fallbackResult.reasons);

                    const fallbackLiveness = await checkLivenessAll(
                      context.probe,
                      fallbackResult.selectors,
                      { timeoutMs: config.timeouts.probe }
                    );

                    const fallbackCandidates = fallbackLiveness.filter(isLive).map((r) => {
                      const score = calculateStabilityScore({
                        selector: r.selector,
                        hint: anchor.hint,
                        snippetMatched: false,
                        livenessResult: r,
                      });
                      return { selector: r.selector, score, livenessResult: r };
                    });

                    if (fallbackCandidates.length > 0) {
                      const bestFallback = findMostStableSelector(fallbackCandidates);
                      if (bestFallback) {
                        const stabilityScore = Math.round(bestFallback.score.overall * 100);
                        reasons.push(
                          `Fallback strategy succeeded with ${fallbackCandidates.length} candidates`
                        );
                        reasons.push(`Best fallback selector: ${bestFallback.selector}`);
                        reasons.push(`Stability score: ${stabilityScore}%`);
                        reasons.push(...bestFallback.score.details);

                        const result: Resolution = {
                          selector: bestFallback.selector,
                          stabilityScore,
                          reasons,
                        };
                        if (anchor.subselector) result.subselector = anchor.subselector;

                        if (context.writeBack && context.anchorsPath) {
                          const updatedAnchors = {
                            ...anchorsData,
                            anchors: anchorsData.anchors.map((a) =>
                              a.id === anchor.id
                                ? {
                                    ...a,
                                    resolvedCss: bestFallback.selector,
                                    lastSeen: new Date().toISOString(),
                                    // Note: write-back now only updates resolvedCss/lastSeen (fallback path)
                                  }
                                : a
                            ),
                          };

                          const postWriteFn = context.postWrite as
                            | undefined
                            | ((p: string, a: object) => Promise<void>);
                          if (postWriteFn) {
                            try {
                              await postWriteFn(context.anchorsPath, updatedAnchors);
                              reasons.push(
                                'Updated anchors persisted via postWrite hook (fallback)'
                              );
                            } catch (err) {
                              reasons.push(
                                `postWrite hook failed: ${err instanceof Error ? err.message : String(err)}`
                              );
                              result.updatedAnchors = updatedAnchors;
                            }
                          } else {
                            result.updatedAnchors = updatedAnchors;
                            reasons.push(
                              'Prepared updated anchors (host will write to file) (fallback)'
                            );
                          }
                        }
                        return result;
                      }
                    } else {
                      reasons.push('Fallback strategies failed to find live elements');
                    }
                  }
                }
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
    const issues: string[] = [];

    // 1) TypeScript is required (if this passes, core functionality works)
    let tsOk = false;
    try {
      const ts = await import('typescript');
      const src = 'const x: number = 42;';
      const sf = ts.createSourceFile(
        'test.ts',
        src,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );
      tsOk = !!sf && sf.statements.length > 0;
      if (!tsOk) {
        issues.push('TypeScript parser is available but failed to parse test code');
      }
    } catch (e) {
      issues.push(`TypeScript dependency issue: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2) parse5 is optional (only needed for HTML path)
    //    Also absorb module shape differences
    let p5Warn = false;
    try {
      const mod: unknown = await import('parse5');

      // Type guard helper
      const hasProperty = (obj: unknown, prop: string): boolean =>
        typeof obj === 'object' && obj !== null && prop in obj;

      const parse =
        hasProperty(mod, 'parse') && typeof (mod as Record<string, unknown>).parse === 'function'
          ? (mod as Record<string, unknown>).parse
          : hasProperty(mod, 'default') &&
              typeof (mod as Record<string, unknown>).default === 'function'
            ? (mod as Record<string, unknown>).default
            : hasProperty(mod, 'default') &&
                hasProperty((mod as Record<string, unknown>).default, 'parse') &&
                typeof ((mod as Record<string, unknown>).default as Record<string, unknown>)
                  .parse === 'function'
              ? ((mod as Record<string, unknown>).default as Record<string, unknown>).parse
              : null;

      if (!parse) {
        p5Warn = true;
        issues.push('parse5 present but parse() function not found (module shape mismatch).');
      } else {
        const doc: unknown = (parse as (html: string) => unknown)('<div class="test">Hello</div>');
        const ok = hasProperty(doc, 'childNodes');
        if (!ok) {
          p5Warn = true;
          issues.push('parse5 parsed document but structure looks unexpected');
        }
      }
    } catch (e) {
      p5Warn = true;
      // This is "optional". We keep the info but don't fail healthy.
      issues.push(`parse5 optional check failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 3) Decision policy:
    //    - TypeScript OK → healthy = true
    //    - parse5 is treated as a warning (included in issues but not reflected in healthy)
    //    - For strict enforcement, use environment variable
    const strictHtml = process.env.UIMATCH_HEALTHCHECK_STRICT_HTML === 'true';
    const healthy = tsOk && (!strictHtml || !p5Warn);

    return {
      healthy,
      message: healthy
        ? 'Plugin is healthy and ready to use'
        : 'Plugin has dependency or parsing issues',
      issues: issues.length ? issues : undefined,
    };
  },
};

// Default export for SPI compliance
export default plugin;

// Named exports for direct usage
export * from '@uimatch/selector-spi';
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
export { resolve };
