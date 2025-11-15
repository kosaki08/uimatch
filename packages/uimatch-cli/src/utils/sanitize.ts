/**
 * Sanitization utilities for safe logging and artifact output
 */

import { parseFigmaRef } from '#plugin/experimental/figma-mcp.js';

/**
 * Make Figma refs safe/compact for logs by reusing exact parsing logic:
 * - URL → fileKey:nodeId
 * - "fileKey:nodeId" → as is
 * - "current" → "current"
 * @param input - Figma URL or reference string
 * @returns Sanitized reference (e.g., "abc123:1-2" or "current")
 */
export function sanitizeFigmaRef(input: string): string {
  try {
    const ref = parseFigmaRef(input);
    if (ref === 'current') return 'current';
    return `${ref.fileKey}:${ref.nodeId}`;
  } catch {
    // Parse failed, return truncated if too long
    return input.length > 64 ? input.slice(0, 64) + '…' : input;
  }
}

/**
 * Mask sensitive tokens/credentials
 * @param token - Sensitive string to mask
 * @param visibleChars - Number of characters to show at start and end (default: 4)
 * @returns Masked string (e.g., "abcd...wxyz" or "***")
 */
export function maskToken(token: string | undefined, visibleChars = 4): string {
  if (!token) return '';
  if (token.length <= 8) return '***';
  return `${token.slice(0, visibleChars)}...${token.slice(-visibleChars)}`;
}

/**
 * Convert absolute path to relative from cwd
 * @param absolutePath - Absolute file path
 * @returns Relative path from current working directory
 */
export function relativizePath(absolutePath: string): string {
  const cwd = process.cwd();
  if (absolutePath.startsWith(cwd)) {
    const relative = absolutePath.slice(cwd.length);
    return relative.startsWith('/') ? `.${relative}` : `./${relative}`;
  }
  return absolutePath;
}

/**
 * Sanitize URL by removing query parameters and fragments (may contain tokens)
 * @param url - URL string
 * @returns URL without query parameters or fragments, or '[invalid-url]' if parsing fails
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

/**
 * Sanitize Figma reference objects to avoid leaking tokens in logs
 * @param ref - Object potentially containing sensitive fields (token, url)
 * @returns Sanitized object with masked tokens and sanitized URLs
 */
export function sanitizeFigmaRefObject(ref: unknown): unknown {
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
