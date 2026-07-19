/**
 * Service Provider Interface (SPI) for Selector Resolution Plugins
 *
 * This file defines the contract between uiMatch core/plugin and selector resolution providers.
 * It is intentionally implementation-agnostic - no TypeScript compiler, parse5, or Playwright dependencies.
 */

import { z } from 'zod';

/**
 * Context provided to the resolver plugin
 */
export interface ResolveContext {
  /**
   * URL of the page being tested
   */
  url: string;

  /**
   * Initial selector provided by the user (e.g., 'button.submit', '.my-component')
   */
  initialSelector: string;

  /**
   * Path to anchors JSON file (if provided)
   * Contains AST/snippet-based selector hints
   */
  anchorsPath?: string;

  /**
   * Whether to write back resolved selectors to anchors file
   */
  writeBack?: boolean;

  /**
   * Optional hook to persist updated anchors after successful resolution
   * If not provided, plugins that support write-back are responsible for
   * validating and persisting their own data.
   *
   * @param path - Path to anchors file
   * @param anchors - Updated anchors data
   */
  postWrite?: (path: string, anchors: object) => Promise<void>;

  /**
   * Probe for lightweight liveness checks
   */
  probe: Probe;

  /**
   * Canonical project root directory used to constrain file access.
   * Hosts should resolve symlinks before passing this boundary.
   */
  projectRoot?: string;

  /**
   * Additional context that may be useful for resolution
   */
  metadata?: {
    /**
     * Component identifier or name (if known)
     */
    componentId?: string;

    /**
     * Any other contextual hints
     */
    [key: string]: unknown;
  };
}

/** Runtime contract for selector plugin output. */
const NonBlankSelectorSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Selector must contain a non-whitespace character',
});

export const ResolutionSchema = z.object({
  /** The resolved selector (may be the initial selector when no better selector exists). */
  selector: NonBlankSelectorSchema,
  /** Optional subselector for child elements (used with Figma auto-ROI). */
  subselector: NonBlankSelectorSchema.optional(),
  /** Stability score on the same 0-100 scale as DFS/SFS/CQI metrics. */
  stabilityScore: z.number().finite().min(0).max(100).optional(),
  /** Human-readable reasons for the resolution choice. */
  reasons: z.array(z.string()).optional(),
  /**
   * Updated anchors data for diagnostics.
   * @deprecated Plugins should persist validated data through postWrite or their own storage layer.
   */
  updatedAnchors: z.record(z.string(), z.unknown()).optional(),
  /** @deprecated Use the name from SelectorResolverPlugin instead. */
  plugin: z.string().optional(),
  /** Error message if resolution failed non-fatally. */
  error: z.string().optional(),
});

/** Result of selector resolution. */
export type Resolution = z.infer<typeof ResolutionSchema>;

/**
 * Probe interface for liveness checking
 *
 * This abstracts away Playwright-specific APIs to allow different implementations.
 * Plugins can optionally implement liveness checks without depending on Playwright types.
 */
export interface Probe {
  /**
   * Check if a selector is alive (exists and optionally visible)
   *
   * @param selector - Selector to check
   * @param options - Check options
   * @returns Liveness check result
   */
  check(selector: string, options?: ProbeOptions): Promise<ProbeResult>;
}

/**
 * Options for liveness probing
 */
export interface ProbeOptions {
  /**
   * Timeout in milliseconds (default: from environment or fallback)
   */
  timeoutMs?: number;

  /**
   * Whether to check element visibility (default: true)
   */
  visible?: boolean;
}

/**
 * Result of a liveness probe
 */
export interface ProbeResult {
  /**
   * The selector that was checked
   */
  selector: string;

  /**
   * Whether the selector is alive (found and optionally visible)
   * @deprecated Use isValid instead (kept for backward compatibility)
   */
  isAlive?: boolean;

  /**
   * Whether the selector is valid (found and optionally visible)
   * Preferred over isAlive for consistency with validation terminology
   */
  isValid: boolean;

  /**
   * Error message if check failed
   */
  error?: string;

  /**
   * Time taken to check (in milliseconds)
   */
  checkTime: number;
}

/**
 * Main plugin interface for selector resolution
 *
 * Plugins must implement this interface and export it as default.
 */
export interface SelectorResolverPlugin {
  /**
   * Plugin name/identifier
   */
  name: string;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Resolve a selector using the plugin's strategy
   *
   * @param context - Resolution context (includes probe for liveness checking)
   * @returns Resolution result
   */
  resolve(context: ResolveContext): Promise<Resolution>;

  /**
   * Optional: Check if the plugin is available and properly configured
   * Useful for early detection of missing dependencies or configuration issues
   *
   * @returns Health check result
   */
  healthCheck?(): Promise<HealthCheckResult>;
}

/**
 * Result of plugin health check
 */
export interface HealthCheckResult {
  /**
   * Whether the plugin is healthy and ready to use
   */
  healthy: boolean;

  /**
   * Diagnostic message
   */
  message?: string;

  /**
   * Any issues found during health check
   */
  issues?: string[];
}

/**
 * Type guard to check if a module implements SelectorResolverPlugin
 */
export function isSelectorResolverPlugin(obj: unknown): obj is SelectorResolverPlugin {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const plugin = obj as Partial<SelectorResolverPlugin>;

  return (
    typeof plugin.name === 'string' &&
    typeof plugin.version === 'string' &&
    typeof plugin.resolve === 'function'
  );
}
