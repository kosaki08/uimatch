/**
 * Configuration management for selector-anchors plugin
 *
 * Centralizes all timeout and performance-related settings with environment variable support
 */

import { logger } from '../utils/debug.js';

/**
 * Default timeout values (in milliseconds)
 */
const DEFAULT_TIMEOUTS = {
  /** Timeout for liveness probe checks */
  PROBE_TIMEOUT: 600,

  /** Timeout for HTML parsing operations (increased to 300ms for real-world codebases) */
  HTML_PARSE_TIMEOUT: 300,

  /** Timeout for snippet hash matching */
  SNIPPET_MATCH_TIMEOUT: 50,

  /** Tiered AST fallback timeouts */
  /** Fast path timeout (tag + testid/id only) */
  AST_FAST_PATH_TIMEOUT: 300,

  /** Attribute-only parsing timeout (all attributes, no text) */
  AST_ATTR_TIMEOUT: 600,

  /** Full parse timeout (everything including text) */
  AST_FULL_TIMEOUT: 900,
} as const;

/**
 * Default snippet matching configuration
 */
const DEFAULT_SNIPPET_CONFIG = {
  /** Maximum search radius for snippet matching (number of lines) */
  MAX_RADIUS: 400,

  /** High confidence threshold for early exit (0.0 - 1.0) */
  HIGH_CONFIDENCE: 0.92,

  /** Fuzzy matching threshold for accepting partial matches (0.0 - 1.0) */
  FUZZY_THRESHOLD: 0.55,
} as const;

/**
 * Environment variable names for configuration
 */
const ENV_VARS = {
  PROBE_TIMEOUT: 'UIMATCH_PROBE_TIMEOUT_MS',
  HTML_PARSE_TIMEOUT: 'UIMATCH_HTML_PARSE_TIMEOUT_MS',
  SNIPPET_MATCH_TIMEOUT: 'UIMATCH_SNIPPET_MATCH_TIMEOUT_MS',
  AST_FAST_PATH_TIMEOUT: 'UIMATCH_AST_FAST_PATH_TIMEOUT_MS',
  AST_ATTR_TIMEOUT: 'UIMATCH_AST_ATTR_TIMEOUT_MS',
  AST_FULL_TIMEOUT: 'UIMATCH_AST_FULL_TIMEOUT_MS',
  SNIPPET_MAX_RADIUS: 'UIMATCH_SNIPPET_MAX_RADIUS',
  SNIPPET_HIGH_CONFIDENCE: 'UIMATCH_SNIPPET_HIGH_CONFIDENCE',
  SNIPPET_FUZZY_THRESHOLD: 'UIMATCH_SNIPPET_FUZZY_THRESHOLD',
} as const;

/**
 * Parse timeout value from environment variable or use default
 */
function parseTimeout(envVar: string, defaultValue: number): number {
  const value = process.env[envVar];
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.warn(`Invalid timeout value for ${envVar}: ${value}, using default ${defaultValue}ms`);
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse float value from environment variable or use default (for thresholds 0.0-1.0)
 */
function parseThreshold(envVar: string, defaultValue: number): number {
  const value = process.env[envVar];
  if (!value) {
    return defaultValue;
  }

  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    logger.warn(`Invalid threshold value for ${envVar}: ${value}, using default ${defaultValue}`);
    return defaultValue;
  }

  return parsed;
}

/**
 * Get configuration with environment variable overrides
 */
export function getConfig() {
  return {
    timeouts: {
      probe: parseTimeout(ENV_VARS.PROBE_TIMEOUT, DEFAULT_TIMEOUTS.PROBE_TIMEOUT),
      htmlParse: parseTimeout(ENV_VARS.HTML_PARSE_TIMEOUT, DEFAULT_TIMEOUTS.HTML_PARSE_TIMEOUT),
      snippetMatch: parseTimeout(
        ENV_VARS.SNIPPET_MATCH_TIMEOUT,
        DEFAULT_TIMEOUTS.SNIPPET_MATCH_TIMEOUT
      ),
      astFastPath: parseTimeout(
        ENV_VARS.AST_FAST_PATH_TIMEOUT,
        DEFAULT_TIMEOUTS.AST_FAST_PATH_TIMEOUT
      ),
      astAttr: parseTimeout(ENV_VARS.AST_ATTR_TIMEOUT, DEFAULT_TIMEOUTS.AST_ATTR_TIMEOUT),
      astFull: parseTimeout(ENV_VARS.AST_FULL_TIMEOUT, DEFAULT_TIMEOUTS.AST_FULL_TIMEOUT),
    },
    snippet: {
      maxRadius: parseTimeout(ENV_VARS.SNIPPET_MAX_RADIUS, DEFAULT_SNIPPET_CONFIG.MAX_RADIUS),
      highConfidence: parseThreshold(
        ENV_VARS.SNIPPET_HIGH_CONFIDENCE,
        DEFAULT_SNIPPET_CONFIG.HIGH_CONFIDENCE
      ),
      fuzzyThreshold: parseThreshold(
        ENV_VARS.SNIPPET_FUZZY_THRESHOLD,
        DEFAULT_SNIPPET_CONFIG.FUZZY_THRESHOLD
      ),
    },
  };
}

/**
 * Export default values for reference
 */
export { DEFAULT_SNIPPET_CONFIG, DEFAULT_TIMEOUTS, ENV_VARS };
