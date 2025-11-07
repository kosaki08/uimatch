import pino from 'pino';
import type { Logger, LogLevel } from './types.js';

/**
 * Creates a structured logger with context support.
 *
 * @example
 * ```ts
 * const logger = createLogger({ package: 'uimatch-core', module: 'capture' });
 * logger.info({ fileId: 123 }, 'Processing file');
 * logger.warn({ error: err.message }, 'Failed to parse');
 * ```
 */
export function createLogger(
  context: Record<string, unknown> = {},
  options: { level?: LogLevel } = {}
): Logger {
  const level = options.level ?? (process.env.UIMATCH_LOG_LEVEL as LogLevel) ?? 'info';

  // Silent mode: return no-op logger
  if (level === 'silent') {
    return {
      debug() {},
      info() {},
      warn() {},
      error() {},
    };
  }

  const baseLogger = pino({
    level,
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    base: context, // Attach context fields to all logs
  });

  return {
    debug: (contextOrMessage: Record<string, unknown> | string, message?: string) => {
      if (typeof contextOrMessage === 'string') {
        baseLogger.debug(contextOrMessage);
      } else {
        baseLogger.debug(contextOrMessage, message ?? '');
      }
    },
    info: (contextOrMessage: Record<string, unknown> | string, message?: string) => {
      if (typeof contextOrMessage === 'string') {
        baseLogger.info(contextOrMessage);
      } else {
        baseLogger.info(contextOrMessage, message ?? '');
      }
    },
    warn: (contextOrMessage: Record<string, unknown> | string, message?: string) => {
      if (typeof contextOrMessage === 'string') {
        baseLogger.warn(contextOrMessage);
      } else {
        baseLogger.warn(contextOrMessage, message ?? '');
      }
    },
    error: (contextOrMessage: Record<string, unknown> | string, message?: string) => {
      if (typeof contextOrMessage === 'string') {
        baseLogger.error(contextOrMessage);
      } else {
        baseLogger.error(contextOrMessage, message ?? '');
      }
    },
  };
}
