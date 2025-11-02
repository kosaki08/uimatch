/**
 * Configuration management for selector-anchors plugin
 *
 * Centralizes all timeout and performance-related settings with environment variable support
 */

/**
 * Default timeout values (in milliseconds)
 */
const DEFAULT_TIMEOUTS = {
  /** Timeout for liveness probe checks */
  PROBE_TIMEOUT: 600,

  /** Timeout for AST parsing operations */
  AST_PARSE_TIMEOUT: 100,

  /** Timeout for HTML parsing operations */
  HTML_PARSE_TIMEOUT: 100,

  /** Timeout for snippet hash matching */
  SNIPPET_MATCH_TIMEOUT: 50,
} as const;

/**
 * Environment variable names for timeout configuration
 */
const ENV_VARS = {
  PROBE_TIMEOUT: 'UIMATCH_PROBE_TIMEOUT_MS',
  AST_PARSE_TIMEOUT: 'UIMATCH_AST_PARSE_TIMEOUT_MS',
  HTML_PARSE_TIMEOUT: 'UIMATCH_HTML_PARSE_TIMEOUT_MS',
  SNIPPET_MATCH_TIMEOUT: 'UIMATCH_SNIPPET_MATCH_TIMEOUT_MS',
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
    console.warn(`Invalid timeout value for ${envVar}: ${value}, using default ${defaultValue}ms`);
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
      astParse: parseTimeout(ENV_VARS.AST_PARSE_TIMEOUT, DEFAULT_TIMEOUTS.AST_PARSE_TIMEOUT),
      htmlParse: parseTimeout(ENV_VARS.HTML_PARSE_TIMEOUT, DEFAULT_TIMEOUTS.HTML_PARSE_TIMEOUT),
      snippetMatch: parseTimeout(
        ENV_VARS.SNIPPET_MATCH_TIMEOUT,
        DEFAULT_TIMEOUTS.SNIPPET_MATCH_TIMEOUT
      ),
    },
  };
}

/**
 * Export default values for reference
 */
export { DEFAULT_TIMEOUTS, ENV_VARS };
