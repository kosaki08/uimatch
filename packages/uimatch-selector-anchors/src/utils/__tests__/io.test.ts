/**
 * Comprehensive tests for io.ts utilities
 * Covers loadSelectorsAnchors, saveSelectorsAnchors, and atomic write patterns
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SelectorsAnchors } from '../../types/schema.js';
import {
  createEmptyAnchors,
  defaultPostWrite,
  loadSelectorsAnchors,
  saveSelectorsAnchors,
} from '../io.js';

describe('io utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `uimatch-io-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('loadSelectorsAnchors', () => {
    test('loads valid anchors file successfully', async () => {
      const anchorsPath = join(testDir, 'valid.json');
      const validData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'test-anchor',
            hint: { prefer: ['testid'] },
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      await fs.writeFile(anchorsPath, JSON.stringify(validData, null, 2), 'utf-8');

      const result = await loadSelectorsAnchors(anchorsPath);

      expect(result).toEqual(validData);
      expect(result.anchors).toHaveLength(1);
      expect(result.anchors[0].id).toBe('test-anchor');
    });

    test('throws error for non-existent file (ENOENT)', () => {
      const nonExistentPath = join(testDir, 'does-not-exist.json');

      expect(loadSelectorsAnchors(nonExistentPath)).rejects.toThrow(/Anchors file not found/);
    });

    test('throws error for invalid JSON syntax', async () => {
      const invalidJsonPath = join(testDir, 'invalid.json');
      await fs.writeFile(invalidJsonPath, '{ invalid json }', 'utf-8');

      expect(loadSelectorsAnchors(invalidJsonPath)).rejects.toThrow(/Invalid JSON syntax/);
    });

    test('throws error for schema validation failure', async () => {
      const invalidSchemaPath = join(testDir, 'invalid-schema.json');
      const invalidData = {
        version: '1.0.0',
        anchors: [
          {
            // Missing required 'id' field
            hint: { prefer: ['testid'] },
          },
        ],
      };

      await fs.writeFile(invalidSchemaPath, JSON.stringify(invalidData), 'utf-8');

      expect(loadSelectorsAnchors(invalidSchemaPath)).rejects.toThrow(
        /Invalid anchors JSON schema/
      );
    });

    test('handles relative paths by resolving them', async () => {
      const anchorsPath = join(testDir, 'relative.json');
      const validData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [],
      };

      await fs.writeFile(anchorsPath, JSON.stringify(validData), 'utf-8');

      // Use a relative path from current working directory
      const relativePath = `./${anchorsPath.split('/').pop()}`;
      const originalCwd = process.cwd();

      try {
        process.chdir(testDir);
        const result = await loadSelectorsAnchors(relativePath);
        expect(result).toEqual(validData);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('saveSelectorsAnchors', () => {
    test('saves valid anchors data successfully', async () => {
      const anchorsPath = join(testDir, 'save-test.json');
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'save-anchor',
            hint: { prefer: ['testid'] },
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      await saveSelectorsAnchors(anchorsPath, anchorsData);

      // Verify file was created
      const content = await fs.readFile(anchorsPath, 'utf-8');
      const parsed = JSON.parse(content) as SelectorsAnchors;

      expect(parsed).toEqual(anchorsData);
    });

    test('creates parent directory if it does not exist', async () => {
      const nestedPath = join(testDir, 'nested/deep/anchors.json');
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [],
      };

      await saveSelectorsAnchors(nestedPath, anchorsData);

      // Verify file exists in nested structure
      const content = await fs.readFile(nestedPath, 'utf-8');
      expect(JSON.parse(content)).toEqual(anchorsData);
    });

    test('uses atomic write pattern (temp file + rename)', async () => {
      const anchorsPath = join(testDir, 'atomic.json');
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [],
      };

      const writeFileSpy = vi.spyOn(fs, 'writeFile');
      const renameSpy = vi.spyOn(fs, 'rename');

      await saveSelectorsAnchors(anchorsPath, anchorsData);

      // Verify atomic write pattern
      expect(writeFileSpy).toHaveBeenCalledWith(`${anchorsPath}.tmp`, expect.any(String), 'utf-8');
      expect(renameSpy).toHaveBeenCalledWith(`${anchorsPath}.tmp`, anchorsPath);

      // Verify temp file was cleaned up
      expect(fs.access(`${anchorsPath}.tmp`)).rejects.toThrow();

      writeFileSpy.mockRestore();
      renameSpy.mockRestore();
    });

    test('handles Windows EEXIST fallback during atomic rename', async () => {
      const anchorsPath = join(testDir, 'windows-fallback.json');
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [],
      };

      // Create existing file
      await fs.writeFile(anchorsPath, '{}', 'utf-8');

      const renameSpy = vi.spyOn(fs, 'rename');
      const rmSpy = vi.spyOn(fs, 'rm');

      // First rename fails with EEXIST, second succeeds
      const eexistError: NodeJS.ErrnoException = new Error('File exists');
      eexistError.code = 'EEXIST';

      let callCount = 0;
      renameSpy.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw eexistError;
        }
        // Second call succeeds - use original implementation
        return Promise.resolve();
      });

      await saveSelectorsAnchors(anchorsPath, anchorsData);

      expect(renameSpy).toHaveBeenCalled();
      expect(rmSpy).toHaveBeenCalledWith(anchorsPath, { force: true });

      renameSpy.mockRestore();
      rmSpy.mockRestore();
    });

    test('handles Windows EPERM fallback during atomic rename', async () => {
      const anchorsPath = join(testDir, 'windows-eperm.json');
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [],
      };

      // Create existing file
      await fs.writeFile(anchorsPath, '{}', 'utf-8');

      const renameSpy = vi.spyOn(fs, 'rename');
      const rmSpy = vi.spyOn(fs, 'rm');

      // First rename fails with EPERM, second succeeds
      const epermError: NodeJS.ErrnoException = new Error('Operation not permitted');
      epermError.code = 'EPERM';

      let callCount = 0;
      renameSpy.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw epermError;
        }
        // Second call succeeds
        return Promise.resolve();
      });

      await saveSelectorsAnchors(anchorsPath, anchorsData);

      expect(renameSpy).toHaveBeenCalled();
      expect(rmSpy).toHaveBeenCalledWith(anchorsPath, { force: true });

      renameSpy.mockRestore();
      rmSpy.mockRestore();
    });

    test('throws error for invalid schema data', () => {
      const anchorsPath = join(testDir, 'invalid.json');
      const invalidData = {
        version: '1.0.0',
        anchors: [{ invalid: 'data' }],
      } as unknown as SelectorsAnchors;

      expect(saveSelectorsAnchors(anchorsPath, invalidData)).rejects.toThrow(
        /Cannot save invalid anchors data/
      );
    });

    test('formats JSON with proper indentation', async () => {
      const anchorsPath = join(testDir, 'formatted.json');
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'format-test',
            hint: { prefer: ['testid'] },
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      await saveSelectorsAnchors(anchorsPath, anchorsData);

      const content = await fs.readFile(anchorsPath, 'utf-8');

      // Check for proper indentation (2 spaces)
      expect(content).toContain('  "version"');
      expect(content).toContain('    "id"');
    });
  });

  describe('createEmptyAnchors', () => {
    test('creates empty anchors structure with default version', () => {
      const empty = createEmptyAnchors();

      expect(empty).toEqual({
        version: '1.0.0',
        anchors: [],
      });
    });

    test('returns new object on each call', () => {
      const empty1 = createEmptyAnchors();
      const empty2 = createEmptyAnchors();

      expect(empty1).not.toBe(empty2);
      expect(empty1.anchors).not.toBe(empty2.anchors);
    });
  });

  describe('defaultPostWrite', () => {
    test('calls saveSelectorsAnchors with provided path and anchors', async () => {
      const anchorsPath = join(testDir, 'postwrite.json');
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [],
      };

      await defaultPostWrite(anchorsPath, anchorsData);

      // Verify file was created
      const content = await fs.readFile(anchorsPath, 'utf-8');
      expect(JSON.parse(content)).toEqual(anchorsData);
    });

    test('propagates errors from saveSelectorsAnchors', () => {
      const anchorsPath = join(testDir, 'postwrite-error.json');
      const invalidData = { invalid: 'data' };

      expect(defaultPostWrite(anchorsPath, invalidData)).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('handles anchors with all optional fields', async () => {
      const anchorsPath = join(testDir, 'full-fields.json');
      const richAnchors: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'rich-anchor',
            hint: { prefer: ['testid', 'role'] },
            source: { file: 'test.tsx', line: 10, col: 5 },
            snippetHash: 'hash123',
            snippet: '<button>',
            snippetContext: { contextBefore: 3, contextAfter: 3 },
            resolvedCss: '[data-testid="test"]',
            subselector: '> span',
            lastSeen: '2025-01-01T00:00:00Z',
            lastKnown: {
              selector: '[data-testid="test"]',
              stabilityScore: 95,
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
        ],
      };

      await saveSelectorsAnchors(anchorsPath, richAnchors);
      const loaded = await loadSelectorsAnchors(anchorsPath);

      // Zod schema applies defaults, so we check structure is preserved
      expect(loaded.anchors).toHaveLength(1);
      expect(loaded.anchors[0].id).toBe('rich-anchor');
      expect(loaded.anchors[0].snippetHash).toBe('hash123');
      expect(loaded.anchors[0].lastKnown?.selector).toBe('[data-testid="test"]');
      expect(loaded.anchors[0].subselector).toBe('> span');
    });

    test('handles empty anchors array', async () => {
      const anchorsPath = join(testDir, 'empty.json');
      const emptyAnchors: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [],
      };

      await saveSelectorsAnchors(anchorsPath, emptyAnchors);
      const loaded = await loadSelectorsAnchors(anchorsPath);

      expect(loaded.anchors).toEqual([]);
    });

    test('handles large anchors file', async () => {
      const anchorsPath = join(testDir, 'large.json');
      const largeAnchors: SelectorsAnchors = {
        version: '1.0.0',
        anchors: Array.from({ length: 1000 }, (_, i) => ({
          id: `anchor-${i}`,
          hint: { prefer: ['testid'] },
          source: { file: `test-${i}.tsx`, line: i + 1, col: 5 }, // line must be > 0
        })),
      };

      await saveSelectorsAnchors(anchorsPath, largeAnchors);
      const loaded = await loadSelectorsAnchors(anchorsPath);

      expect(loaded.anchors).toHaveLength(1000);
      expect(loaded.anchors[0].id).toBe('anchor-0');
      expect(loaded.anchors[999].id).toBe('anchor-999');
    });
  });
});
