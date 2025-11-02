import pino from 'pino';
import type { Logger, LogLevel } from '@uimatch/shared-logging';

interface LoggerOptions {
  level?: LogLevel;
  format?: 'json' | 'pretty' | 'silent';
  file?: string;
}

/**
 * Sanitize URL by removing query parameters and fragments that may contain tokens.
 */
function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

/**
 * Mask token strings in headers or auth objects.
 */
function maskToken(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Sanitize Figma reference objects to avoid leaking tokens.
 */
function sanitizeFigmaRef(ref: unknown): unknown {
  if (typeof ref !== 'object' || ref === null) return ref;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ref)) {
    if (key === 'token' && typeof value === 'string') {
      sanitized[key] = maskToken(value);
    } else if (key === 'url' && typeof value === 'string') {
      sanitized[key] = sanitizeUrl(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Create a pino-based logger with redaction and sanitization.
 * Supports JSON, pretty, or silent output.
 */
export function createLogger(options?: LoggerOptions): Logger {
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
 */
export const sanitize = {
  url: sanitizeUrl,
  token: maskToken,
  figmaRef: sanitizeFigmaRef,
};
