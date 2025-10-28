/**
 * Sanitization utilities for safe logging and artifact output
 */

import { parseFigmaRef } from '../adapters/figma-mcp.js';

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
 * @param visibleChars - Number of characters to show at end (default: 4)
 * @returns Masked string (e.g., "***xyz")
 */
export function maskToken(token: string | undefined, visibleChars = 4): string {
  if (!token) return 'not set';
  if (token.length <= visibleChars) return '***';
  return '***' + token.slice(-visibleChars);
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
 * Sanitize URL by removing query parameters (may contain tokens)
 * @param url - URL string
 * @returns URL without query parameters
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}
