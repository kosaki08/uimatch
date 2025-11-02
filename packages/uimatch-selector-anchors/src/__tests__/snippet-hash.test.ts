import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSnippetMatch, generateSnippetHash } from '../hashing/snippet-hash';

describe('Snippet Hash', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'uimatch-snippet-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('generateSnippetHash', () => {
    test('generates hash for code snippet', async () => {
      const code = `import React from 'react';

export function Hero() {
  return (
    <div data-testid="hero-root">
      <h1>Welcome</h1>
      <button>Get Started</button>
    </div>
  );
}`;

      const filePath = join(tempDir, 'Hero.tsx');
      await writeFile(filePath, code);

      // Hash line 5 (the div with data-testid)
      const result = await generateSnippetHash(filePath, 5);

      expect(result.hash).toMatch(/^sha1:[0-9a-f]{10}$/);
      expect(result.startLine).toBe(2); // 5 - 3
      expect(result.endLine).toBe(8); // 5 + 3
      expect(result.snippet).toContain('data-testid="hero-root"');
      expect(result.snippet).toContain('export function Hero()');
    });

    test('handles edge case at file start', async () => {
      const code = `line 1
line 2
line 3
line 4`;

      const filePath = join(tempDir, 'start.ts');
      await writeFile(filePath, code);

      const result = await generateSnippetHash(filePath, 1);

      expect(result.startLine).toBe(1); // Can't go before line 1
      expect(result.endLine).toBe(4); // 1 + 3
    });

    test('handles edge case at file end', async () => {
      const code = `line 1
line 2
line 3
line 4`;

      const filePath = join(tempDir, 'end.ts');
      await writeFile(filePath, code);

      const result = await generateSnippetHash(filePath, 4);

      expect(result.startLine).toBe(1); // 4 - 3
      expect(result.endLine).toBe(4); // Can't go beyond line 4
    });

    test('throws on invalid line number', async () => {
      const code = 'line 1\nline 2';
      const filePath = join(tempDir, 'invalid.ts');
      await writeFile(filePath, code);

      expect(generateSnippetHash(filePath, 0)).rejects.toThrow(/Invalid line number/);
      expect(generateSnippetHash(filePath, 10)).rejects.toThrow(/Invalid line number/);
    });

    test('supports custom context size', async () => {
      const code = `1
2
3
4
5
6
7`;

      const filePath = join(tempDir, 'custom.ts');
      await writeFile(filePath, code);

      const result = await generateSnippetHash(filePath, 4, {
        contextBefore: 1,
        contextAfter: 1,
      });

      expect(result.startLine).toBe(3); // 4 - 1
      expect(result.endLine).toBe(5); // 4 + 1
      expect(result.snippet).toBe('3\n4\n5');
    });

    test('supports different hash algorithms', async () => {
      const code = 'test code';
      const filePath = join(tempDir, 'hash.ts');
      await writeFile(filePath, code);

      const sha1 = await generateSnippetHash(filePath, 1, { algorithm: 'sha1' });
      const sha256 = await generateSnippetHash(filePath, 1, { algorithm: 'sha256' });
      const md5 = await generateSnippetHash(filePath, 1, { algorithm: 'md5' });

      expect(sha1.hash).toMatch(/^sha1:/);
      expect(sha256.hash).toMatch(/^sha256:/);
      expect(md5.hash).toMatch(/^md5:/);
      expect(sha1.hash).not.toBe(sha256.hash);
    });
  });

  describe('findSnippetMatch', () => {
    test('finds exact match at original location', async () => {
      const code = `import React from 'react';

export function Hero() {
  return (
    <div data-testid="hero-root">
      <h1>Welcome</h1>
    </div>
  );
}`;

      const filePath = join(tempDir, 'exact.tsx');
      await writeFile(filePath, code);

      // Generate hash at line 5
      const result = await generateSnippetHash(filePath, 5);

      // Find should return same line
      const found = await findSnippetMatch(filePath, result, 5);
      expect(found).toBe(5);
    });

    test('finds match when code has moved down', async () => {
      const originalCode = `import React from 'react';

export function Hero() {
  return <div>Hello</div>;
}`;

      const modifiedCode = `import React from 'react';

// New comment added
// Another comment

export function Hero() {
  return <div>Hello</div>;
}`;

      const filePath = join(tempDir, 'moved.tsx');

      // Generate hash from original code at line 3
      await writeFile(filePath, originalCode);
      const result = await generateSnippetHash(filePath, 3);

      // Modify code (function moved down by 2 lines)
      await writeFile(filePath, modifiedCode);

      // Find should locate best matching position
      // Note: Line 4's snippet (lines 2-7) has highest similarity to original (lines 1-5)
      // because it includes both "import React" and "export function Hero()"
      const found = await findSnippetMatch(filePath, result, 3);
      expect(found).toBe(4);
    });

    test('returns null when no good match found', async () => {
      const originalCode = `export function Original() {
  return <div>Old code</div>;
}`;

      const completelyDifferentCode = `export function CompletelyDifferent() {
  const x = 42;
  console.log(x);
  return null;
}`;

      const filePath = join(tempDir, 'nomatch.tsx');

      // Generate hash from original
      await writeFile(filePath, originalCode);
      const result = await generateSnippetHash(filePath, 2);

      // Replace with completely different code
      await writeFile(filePath, completelyDifferentCode);

      // Should not find match
      const found = await findSnippetMatch(filePath, result, 2);
      expect(found).toBeNull();
    });

    test('handles partial matches with threshold', async () => {
      const originalCode = `export function Component() {
  const value = 42;
  return <div>{value}</div>;
}`;

      const slightlyModifiedCode = `export function Component() {
  const value = 99; // Changed value
  return <div>{value}</div>;
}`;

      const filePath = join(tempDir, 'partial.tsx');

      // Generate hash from original
      await writeFile(filePath, originalCode);
      const result = await generateSnippetHash(filePath, 2);

      // Modify slightly
      await writeFile(filePath, slightlyModifiedCode);

      // Should find approximate match (>60% similarity)
      // Note: All lines have equal similarity scores, so the algorithm prefers the last line (4)
      // based on the "prefer later line numbers when scores are equal" rule
      const found = await findSnippetMatch(filePath, result, 2);
      expect(found).toBe(4);
    });
  });
});
