/**
 * Log level enumeration.
 */
export type LogLevel = 'silent' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Minimal logger interface for library use.
 * Libraries can accept this interface optionally,
 * allowing host applications to inject their own logger implementation.
 */
export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
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
