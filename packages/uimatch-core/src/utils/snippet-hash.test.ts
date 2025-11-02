/**
 * Unit tests for snippet-hash utilities
 */

import { describe, expect, test } from 'bun:test';
import { generateSnippetHash, generateSnippetHashes } from './snippet-hash';

describe('generateSnippetHash', () => {
  test('generates consistent hash for same code', () => {
    const code = 'const x = 42;';
    const hash1 = generateSnippetHash(code);
    const hash2 = generateSnippetHash(code);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  test('generates different hashes for different code', () => {
    const code1 = 'const x = 42;';
    const code2 = 'const y = 43;';
    const hash1 = generateSnippetHash(code1);
    const hash2 = generateSnippetHash(code2);
    expect(hash1).not.toBe(hash2);
  });

  test('syntax-only mode ignores comments', () => {
    const code1 = 'const x = 42;';
    const code2 = 'const x = 42; // comment';
    const hash1 = generateSnippetHash(code1, { syntaxOnly: true });
    const hash2 = generateSnippetHash(code2, { syntaxOnly: true });
    expect(hash1).toBe(hash2);
  });

  test('syntax-only mode ignores whitespace', () => {
    const code1 = 'const x = 42;';
    const code2 = 'const  x  =  42;';
    const hash1 = generateSnippetHash(code1, { syntaxOnly: true });
    const hash2 = generateSnippetHash(code2, { syntaxOnly: true });
    expect(hash1).toBe(hash2);
  });

  test('syntax-only mode strips multi-line comments', () => {
    const code1 = 'const x = 42;';
    const code2 = '/* comment */\nconst x = 42;';
    const hash1 = generateSnippetHash(code1, { syntaxOnly: true });
    const hash2 = generateSnippetHash(code2, { syntaxOnly: true });
    expect(hash1).toBe(hash2);
  });

  test('syntax-only mode strips JSDoc comments', () => {
    const code1 = 'function foo() {}';
    const code2 = '/** JSDoc */\nfunction foo() {}';
    const hash1 = generateSnippetHash(code1, { syntaxOnly: true });
    const hash2 = generateSnippetHash(code2, { syntaxOnly: true });
    expect(hash1).toBe(hash2);
  });

  test('regular mode is sensitive to comments', () => {
    const code1 = 'const x = 42;';
    const code2 = 'const x = 42; // comment';
    const hash1 = generateSnippetHash(code1);
    const hash2 = generateSnippetHash(code2);
    expect(hash1).not.toBe(hash2);
  });

  test('regular mode is sensitive to whitespace', () => {
    const code1 = 'const x = 42;';
    const code2 = 'const  x  =  42;';
    const hash1 = generateSnippetHash(code1);
    const hash2 = generateSnippetHash(code2);
    expect(hash1).not.toBe(hash2);
  });

  test('supports HTML language', () => {
    const html1 = '<div class="test">Hello</div>';
    const html2 = '<!-- comment --><div class="test">Hello</div>';
    const hash1 = generateSnippetHash(html1, { syntaxOnly: true, language: 'html' });
    const hash2 = generateSnippetHash(html2, { syntaxOnly: true, language: 'html' });
    expect(hash1).toBe(hash2);
  });

  test('supports CSS language', () => {
    const css1 = '.test { color: red; }';
    const css2 = '/* comment */ .test { color: red; }';
    const hash1 = generateSnippetHash(css1, { syntaxOnly: true, language: 'css' });
    const hash2 = generateSnippetHash(css2, { syntaxOnly: true, language: 'css' });
    expect(hash1).toBe(hash2);
  });
});

describe('generateSnippetHashes', () => {
  test('generates hashes for multiple snippets', () => {
    const snippets = ['const x = 1;', 'const y = 2;', 'const z = 3;'];
    const hashes = generateSnippetHashes(snippets);
    expect(hashes).toHaveLength(3);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(hashes[1]).not.toBe(hashes[2]);
  });

  test('applies options consistently', () => {
    const snippets = ['const x = 1; // A', 'const y = 2; // B'];
    const hashes = generateSnippetHashes(snippets, { syntaxOnly: true });
    const hash1 = generateSnippetHash('const x = 1;', { syntaxOnly: true });
    const hash2 = generateSnippetHash('const y = 2;', { syntaxOnly: true });
    expect(hashes[0]).toBe(hash1);
    expect(hashes[1]).toBe(hash2);
  });

  test('handles empty array', () => {
    const hashes = generateSnippetHashes([]);
    expect(hashes).toHaveLength(0);
  });
});
