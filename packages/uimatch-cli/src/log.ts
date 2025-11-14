import type { Logger, LogLevel } from '@uimatch/shared-logging';
import pino from 'pino';
import { maskToken, sanitizeFigmaRefObject, sanitizeUrl } from './utils/sanitize.js';

interface LoggerOptions {
  level?: LogLevel;
  format?: 'json' | 'pretty' | 'silent';
  file?: string;
}

/**
 * Create a pino-based logger with redaction and sanitization.
 * Supports JSON, pretty, or silent output.
 */
export function createCliLogger(options?: LoggerOptions): Logger {
  const level = options?.level ?? (process.env.UIMATCH_LOG_LEVEL as LogLevel) ?? 'info';
  const format = options?.format ?? process.env.UIMATCH_LOG_FORMAT ?? 'pretty';
  const file = options?.file ?? process.env.UIMATCH_LOG_FILE;

  // Redact sensitive fields
  const redact = {
    paths: [
      'basicAuth.password',
      'headers.authorization',
      'FIGMA_MCP_TOKEN',
      'token',
      '*.token',
      '*.password',
    ],
    censor: '***',
  };

  // Silent mode
  if (format === 'silent' || level === 'silent') {
    const noop = {
      debug() {},
      info() {},
      warn() {},
      error() {},
    };
    return noop;
  }

  // Base pino instance
  const baseOpts: pino.LoggerOptions = {
    level,
    redact,
  };

  // File output
  if (file) {
    const destination = pino.destination({ dest: file, sync: false });
    return pino(baseOpts, destination) as Logger;
  }

  // JSON format (for CI)
  if (format === 'json') {
    return pino(baseOpts) as Logger;
  }

  // Pretty format (for development)
  const transport: pino.TransportTargetOptions = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
  const stream = pino.transport(transport) as pino.DestinationStream;
  return pino(baseOpts, stream) as Logger;
}

/**
 * Export sanitization utilities for external use.
 * Re-exports from centralized sanitize module to maintain backward compatibility.
 */
export const sanitize = {
  url: sanitizeUrl,
  token: maskToken,
  figmaRef: sanitizeFigmaRefObject,
};
