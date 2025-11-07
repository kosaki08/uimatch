/**
 * Log level enumeration.
 */
export type LogLevel = 'silent' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured logger interface supporting both simple messages and context objects.
 *
 * @example
 * ```ts
 * logger.info('Simple message');
 * logger.warn({ userId: 123, action: 'delete' }, 'User action logged');
 * ```
 */
export interface Logger {
  debug: (contextOrMessage: Record<string, unknown> | string, message?: string) => void;
  info: (contextOrMessage: Record<string, unknown> | string, message?: string) => void;
  warn: (contextOrMessage: Record<string, unknown> | string, message?: string) => void;
  error: (contextOrMessage: Record<string, unknown> | string, message?: string) => void;
}

/**
 * No-op logger implementation (silent).
 */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
