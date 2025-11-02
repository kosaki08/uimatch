/**
 * Utilities for generating collision-resistant hashes from code snippets
 * Supports syntax-only mode for resilience against formatting changes
 */

import { createHash } from 'node:crypto';

export interface SnippetHashOptions {
  /**
   * If true, strips comments and whitespace before hashing (syntax-only)
   * Makes hash resilient to formatting/comment changes
   * @default false
   */
  syntaxOnly?: boolean;

  /**
   * Programming language for syntax-aware preprocessing
   * Currently supports: 'typescript', 'javascript', 'html', 'css'
   * @default 'typescript'
   */
  language?: 'typescript' | 'javascript' | 'html' | 'css';
}

/**
 * Strip comments and normalize whitespace from TypeScript/JavaScript code
 * Simple regex-based approach (does not require AST parsing)
 */
function stripTsJsComments(code: string): string {
  return (
    code
      // Remove single-line comments (// ...)
      .replace(/\/\/.*$/gm, '')
      // Remove multi-line comments (/* ... */)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove JSDoc comments (/** ... */)
      .replace(/\/\*\*[\s\S]*?\*\//g, '')
      // Normalize whitespace (collapse multiple spaces/newlines)
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Strip comments and normalize whitespace from HTML
 */
function stripHtmlComments(html: string): string {
  return (
    html
      // Remove HTML comments (<!-- ... -->)
      .replace(/<!--[\s\S]*?-->/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Strip comments and normalize whitespace from CSS
 */
function stripCssComments(css: string): string {
  return (
    css
      // Remove CSS comments (/* ... */)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Preprocess code snippet based on language and options
 */
function preprocessSnippet(snippet: string, options: SnippetHashOptions): string {
  if (!options.syntaxOnly) {
    return snippet;
  }

  const lang = options.language ?? 'typescript';

  switch (lang) {
    case 'typescript':
    case 'javascript':
      return stripTsJsComments(snippet);
    case 'html':
      return stripHtmlComments(snippet);
    case 'css':
      return stripCssComments(snippet);
    default:
      return snippet;
  }
}

/**
 * Generate a collision-resistant hash from a code snippet
 * Uses SHA-256 and returns first 16 chars (64-bit equivalent)
 *
 * @param snippet Code snippet to hash
 * @param options Hash generation options
 * @returns Hash string (16 hex characters)
 *
 * @example
 * ```typescript
 * // Regular hash (sensitive to whitespace/comments)
 * const hash1 = generateSnippetHash('const x = 1;');
 *
 * // Syntax-only hash (ignores formatting)
 * const hash2 = generateSnippetHash('const x = 1; // comment', { syntaxOnly: true });
 * const hash3 = generateSnippetHash('const  x  =  1;', { syntaxOnly: true });
 * // hash2 === hash3 (both normalize to same syntax)
 * ```
 */
export function generateSnippetHash(snippet: string, options: SnippetHashOptions = {}): string {
  const processed = preprocessSnippet(snippet, options);
  return createHash('sha256').update(processed).digest('hex').slice(0, 16);
}

/**
 * Generate hashes for multiple snippets
 * Useful for batch processing with consistent options
 *
 * @param snippets Array of code snippets
 * @param options Hash generation options
 * @returns Array of hashes
 */
export function generateSnippetHashes(
  snippets: string[],
  options: SnippetHashOptions = {}
): string[] {
  return snippets.map((snippet) => generateSnippetHash(snippet, options));
}
