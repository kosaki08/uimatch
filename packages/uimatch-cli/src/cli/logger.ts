/**
 * Global logger instance for CLI.
 * Initialized lazily based on CLI options and environment variables.
 */
import { type Logger, type LogLevel, silentLogger } from '@uimatch/shared-logging';
import { createLogger } from '../log.js';

let globalLogger: Logger | undefined;

/**
 * Parse log-related CLI options from arguments.
 */
export function parseLogOptions(args: string[]): {
  level?: LogLevel;
  format?: 'json' | 'pretty' | 'silent';
  file?: string;
} {
  const options: { level?: LogLevel; format?: 'json' | 'pretty' | 'silent'; file?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--log-level' && i + 1 < args.length) {
      options.level = args[++i] as LogLevel;
    } else if (arg === '--log-format' && i + 1 < args.length) {
      options.format = args[++i] as 'json' | 'pretty' | 'silent';
    } else if (arg === '--log-file' && i + 1 < args.length) {
      options.file = args[++i];
    }
  }

  return options;
}

/**
 * Initialize the global logger with parsed options.
 */
export function initLogger(args: string[]): Logger {
  const options = parseLogOptions(args);
  globalLogger = createLogger(options);
  return globalLogger;
}

/**
 * Get the global logger instance.
 * Throws if logger has not been initialized.
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initLogger() first.');
  }
  return globalLogger;
}

/**
 * Reset the global logger (for testing).
 */
export function resetLogger(): void {
  globalLogger = undefined;
}

/**
 * Get the global logger instance with safe fallback.
 * Returns silentLogger if logger has not been initialized (e.g., when used outside CLI context).
 */
export function getLoggerSafe(): Logger {
  if (!globalLogger) {
    return silentLogger;
  }
  return globalLogger;
}
