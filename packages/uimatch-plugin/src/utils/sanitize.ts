/**
 * Sanitization utilities for safe logging and artifact output
 */

/**
 * Sanitize Figma URL/reference for safe logging
 * Converts full URL to compact fileKey:nodeId format
 * @param input - Figma URL or reference string
 * @returns Sanitized reference (e.g., "abc123:1-2")
 */
export function sanitizeFigmaRef(input: string): string {
  try {
    const url = new URL(input);
    const key = url.pathname.split('/').filter(Boolean).at(-1) ?? 'unknown';
    const nodeId = url.searchParams.get('node-id')?.replace(/-/g, ':') ?? 'current';
    return `${key}:${nodeId}`;
  } catch {
    // Not a URL, return truncated if too long
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
