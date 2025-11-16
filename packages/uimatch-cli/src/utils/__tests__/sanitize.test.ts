import { describe, expect, test } from 'bun:test';
import { maskToken, relativizePath, sanitizeFigmaRefObject, sanitizeUrl } from '../sanitize.js';

describe('sanitizeUrl', () => {
  test('strips query and hash for http URLs', () => {
    expect(sanitizeUrl('https://example.com/path?token=secret#section')).toBe(
      'https://example.com/path'
    );
  });

  test('strips query for https URLs', () => {
    expect(sanitizeUrl('https://api.example.com/v1/users?key=secret')).toBe(
      'https://api.example.com/v1/users'
    );
  });

  test('handles data URLs by truncating long content', () => {
    const url = 'data:text/html,' + 'A'.repeat(200);
    const result = sanitizeUrl(url);
    expect(result.startsWith('data:text/html,')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(67); // 64 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  test('handles short data URLs without truncation', () => {
    const url = 'data:text/html,<h1>Test</h1>';
    expect(sanitizeUrl(url)).toBe(url);
  });

  test('handles data URLs with base64 content', () => {
    const url = 'data:image/png;base64,' + 'iVBORw0KG'.repeat(20);
    const result = sanitizeUrl(url);
    expect(result.startsWith('data:image/png;base64,')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(67);
  });

  test('returns placeholder for invalid URL', () => {
    expect(sanitizeUrl('@@ not a url')).toBe('[invalid-url]');
  });

  test('returns placeholder for empty string', () => {
    expect(sanitizeUrl('')).toBe('[invalid-url]');
  });

  test('handles protocol-relative URLs as invalid', () => {
    // Protocol-relative URLs without a base URL are invalid
    expect(sanitizeUrl('//example.com/path?query=value')).toBe('[invalid-url]');
  });
});

describe('maskToken', () => {
  test('masks long tokens', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz';
    expect(maskToken(token)).toBe('abcd...wxyz');
  });

  test('masks short tokens completely', () => {
    expect(maskToken('short')).toBe('***');
  });

  test('handles empty/undefined tokens', () => {
    expect(maskToken('')).toBe('');
    expect(maskToken(undefined)).toBe('');
  });

  test('respects custom visibleChars parameter', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz';
    expect(maskToken(token, 6)).toBe('abcdef...uvwxyz');
  });
});

describe('relativizePath', () => {
  test('converts absolute path to relative', () => {
    const cwd = process.cwd();
    const absolutePath = `${cwd}/src/components/Button.tsx`;
    expect(relativizePath(absolutePath)).toBe('./src/components/Button.tsx');
  });

  test('returns path as-is if not under cwd', () => {
    const absolutePath = '/some/other/path/file.txt';
    expect(relativizePath(absolutePath)).toBe(absolutePath);
  });

  test('handles cwd path correctly', () => {
    const cwd = process.cwd();
    // relativizePath returns './' for cwd
    expect(relativizePath(cwd)).toBe('./');
  });
});

describe('sanitizeFigmaRefObject', () => {
  test('masks token field in object', () => {
    const ref = {
      token: 'secret-figma-token-1234567890',
      fileKey: 'abc123',
    };
    const sanitized = sanitizeFigmaRefObject(ref) as Record<string, unknown>;
    expect(sanitized.token).toBe('secr...7890');
    expect(sanitized.fileKey).toBe('abc123');
  });

  test('sanitizes url field in object', () => {
    const ref = {
      url: 'https://figma.com/file/abc?token=secret#node',
      nodeId: '1-2',
    };
    const sanitized = sanitizeFigmaRefObject(ref) as Record<string, unknown>;
    expect(sanitized.url).toBe('https://figma.com/file/abc');
    expect(sanitized.nodeId).toBe('1-2');
  });

  test('handles both token and url fields', () => {
    const ref = {
      token: 'secret-token',
      url: 'https://example.com/api?key=value',
    };
    const sanitized = sanitizeFigmaRefObject(ref) as Record<string, unknown>;
    // 'secret-token' is 12 chars, so it gets masked with 4 chars visible on each side
    expect(sanitized.token).toBe('secr...oken');
    expect(sanitized.url).toBe('https://example.com/api');
  });

  test('returns non-object values as-is', () => {
    expect(sanitizeFigmaRefObject(null)).toBe(null);
    expect(sanitizeFigmaRefObject('string')).toBe('string');
    expect(sanitizeFigmaRefObject(123)).toBe(123);
  });
});
