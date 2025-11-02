/**
 * Service Provider Interface (SPI) for Selector Resolution Plugins
 *
 * This file defines the contract between uiMatch core/plugin and selector resolution providers.
 * It is intentionally implementation-agnostic - no TypeScript compiler, parse5, or Playwright dependencies.
 *
 * Phase 0: Interface definition only (no implementation)
 * This establishes the boundary for future plugin isolation.
 */

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
   * Probe for lightweight liveness checks
   */
  probe: Probe;

  /**
   * Project root directory (for resolving relative paths)
   * @deprecated Use anchorsPath instead
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

/**
 * Result of selector resolution
 */
export interface Resolution {
  /**
   * The resolved selector (may be same as initial if no better selector found)
   */
  selector: string;

  /**
   * Optional subselector for child elements (used with Figma auto-ROI)
   */
  subselector?: string;

  /**
   * Stability score for the resolved selector (0-100 scale, consistent with DFS/SFS/CQI metrics).
   * Higher is more stable.
   */
  stabilityScore?: number;

  /**
   * Human-readable reasons for the resolution choice
   */
  reasons?: string[];

  /**
   * Updated anchors data structure (caller handles JSON.stringify and formatting).
   * Only present if writeBack=true and update was performed.
   */
  updatedAnchors?: object;

  /**
   * Plugin identifier that performed the resolution
   * @deprecated Use plugin name from SelectorResolverPlugin instead
   */
  plugin?: string;

  /**
   * Error message if resolution failed (non-fatal)
   */
  error?: string;
}

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
 * Alias for ProbeResult for compatibility with phase 1 spec
 */
export type LivenessResult = ProbeResult;

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
