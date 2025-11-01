/**
 * Configuration loader from environment variables
 */

import { DEFAULT_CONFIG } from './defaults';
import { AppConfigSchema, type AppConfig } from './schema';

/**
 * Load configuration from environment variables with validation.
 * Falls back to defaults for missing values.
 *
 * Environment variables:
 * - BASIC_AUTH_USER: HTTP Basic Auth username
 * - BASIC_AUTH_PASS: HTTP Basic Auth password
 * - PIXELMATCH_THRESHOLD: Pixelmatch threshold (0-1)
 * - COLOR_DELTA_E_THRESHOLD: Color delta E threshold
 *
 * @param env - Environment variables object (defaults to process.env)
 * @returns Validated configuration
 * @throws If configuration is invalid
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const config: AppConfig = {
    capture: {
      ...DEFAULT_CONFIG.capture,
      basicAuthUser: env.BASIC_AUTH_USER,
      basicAuthPass: env.BASIC_AUTH_PASS,
    },
    comparison: {
      ...DEFAULT_CONFIG.comparison,
      pixelmatchThreshold: env.PIXELMATCH_THRESHOLD
        ? parseFloat(env.PIXELMATCH_THRESHOLD)
        : DEFAULT_CONFIG.comparison.pixelmatchThreshold,
      colorDeltaEThreshold: env.COLOR_DELTA_E_THRESHOLD
        ? parseFloat(env.COLOR_DELTA_E_THRESHOLD)
        : DEFAULT_CONFIG.comparison.colorDeltaEThreshold,
    },
    axisInference: {
      ...DEFAULT_CONFIG.axisInference,
    },
  };

  // Validate using zod schema
  return AppConfigSchema.parse(config);
}

/**
 * Merge partial configuration with defaults.
 *
 * @param partial - Partial configuration to merge
 * @returns Complete configuration with defaults applied
 */
export function mergeConfig(partial: Partial<AppConfig>): AppConfig {
  const merged: AppConfig = {
    capture: {
      ...DEFAULT_CONFIG.capture,
      ...partial.capture,
    },
    comparison: {
      ...DEFAULT_CONFIG.comparison,
      ...partial.comparison,
    },
    axisInference: {
      ...DEFAULT_CONFIG.axisInference,
      ...partial.axisInference,
    },
  };

  return AppConfigSchema.parse(merged);
}
