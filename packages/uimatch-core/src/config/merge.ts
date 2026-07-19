import { DEFAULT_CONFIG } from './defaults';
import { AppConfigSchema, type AppConfig } from './schema';

/**
 * Merge partial configuration with defaults and validate the result.
 */
export function mergeConfig(partial: Partial<AppConfig>): AppConfig {
  return AppConfigSchema.parse({
    capture: {
      ...DEFAULT_CONFIG.capture,
      ...partial.capture,
    },
    comparison: {
      ...DEFAULT_CONFIG.comparison,
      ...partial.comparison,
    },
  });
}
