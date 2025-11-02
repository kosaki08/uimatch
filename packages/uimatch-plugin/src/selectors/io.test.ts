import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEmptyAnchors, loadSelectorsAnchors, saveSelectorsAnchors } from './io.js';
import type { SelectorsAnchors } from './schema.js';

describe('Selector Anchors I/O', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'uimatch-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('loadSelectorsAnchors', () => {
    test('loads valid JSON file', async () => {
      const validData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'hero-cta',
            source: { file: 'app/Hero.tsx', line: 32, col: 10 },
            hint: {
              prefer: ['testid', 'role'],
              expectedText: 'Get Started',
              testid: 'hero-cta',
            },
            snippetHash: 'sha1:7a2c',
            lastKnown: {
              selector: 'role:button[name="Get Started"]',
            },
            meta: {
              component: 'Hero',
            },
          },
        ],
      };

      const filePath = join(tempDir, 'anchors.json');
      await writeFile(filePath, JSON.stringify(validData, null, 2));

      const loaded = await loadSelectorsAnchors(filePath);

      expect(loaded).toEqual(validData);
      expect(loaded.anchors).toHaveLength(1);
      expect(loaded.anchors[0]?.id).toBe('hero-cta');
    });

    test('throws on missing file', () => {
      const missingPath = join(tempDir, 'nonexistent.json');

      expect(loadSelectorsAnchors(missingPath)).rejects.toThrow(/Anchors file not found/);
    });

    test('throws on invalid JSON syntax', async () => {
      const filePath = join(tempDir, 'invalid.json');
      await writeFile(filePath, '{ invalid json }');

      expect(loadSelectorsAnchors(filePath)).rejects.toThrow(/Invalid JSON syntax/);
    });

    test('throws on invalid schema', async () => {
      const invalidData = {
        version: '1.0.0',
        anchors: [
          {
            id: 'test',
            source: { file: 'app/Test.tsx' }, // missing line and col
          },
        ],
      };

      const filePath = join(tempDir, 'invalid-schema.json');
      await writeFile(filePath, JSON.stringify(invalidData));

      expect(loadSelectorsAnchors(filePath)).rejects.toThrow(/Invalid anchors JSON schema/);
    });

    test('loads minimal valid anchors', async () => {
      const minimalData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'minimal',
            source: { file: 'app/Minimal.tsx', line: 1, col: 0 },
          },
        ],
      };

      const filePath = join(tempDir, 'minimal.json');
      await writeFile(filePath, JSON.stringify(minimalData));

      const loaded = await loadSelectorsAnchors(filePath);

      expect(loaded).toEqual(minimalData);
    });
  });

  describe('saveSelectorsAnchors', () => {
    test('saves valid data to file', async () => {
      const data: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'save-test',
            source: { file: 'app/Save.tsx', line: 10, col: 5 },
            hint: {
              testid: 'save-button',
            },
          },
        ],
      };

      const filePath = join(tempDir, 'saved.json');
      await saveSelectorsAnchors(filePath, data);

      // Verify by loading it back
      const loaded = await loadSelectorsAnchors(filePath);
      expect(loaded).toEqual(data);
    });

    test('creates directory if not exists', async () => {
      const data: SelectorsAnchors = createEmptyAnchors();
      const filePath = join(tempDir, 'nested', 'dir', 'anchors.json');

      await saveSelectorsAnchors(filePath, data);

      const loaded = await loadSelectorsAnchors(filePath);
      expect(loaded).toEqual(data);
    });

    test('throws on invalid data', () => {
      const invalidData = {
        version: '1.0.0',
        anchors: [
          {
            id: 'invalid',
            source: { file: 'test.tsx' }, // missing line/col
          },
        ],
      } as unknown as SelectorsAnchors;

      const filePath = join(tempDir, 'invalid.json');

      expect(saveSelectorsAnchors(filePath, invalidData)).rejects.toThrow(
        /Cannot save invalid anchors data/
      );
    });

    test('formats JSON with indentation', async () => {
      const data: SelectorsAnchors = createEmptyAnchors();
      const filePath = join(tempDir, 'formatted.json');

      await saveSelectorsAnchors(filePath, data);

      const rawContent = await Bun.file(filePath).text();
      expect(rawContent).toContain('\n  '); // Has indentation
    });
  });

  describe('createEmptyAnchors', () => {
    test('creates empty anchors structure', () => {
      const empty = createEmptyAnchors();

      expect(empty.version).toBe('1.0.0');
      expect(empty.anchors).toEqual([]);
    });

    test('can be saved and loaded', async () => {
      const empty = createEmptyAnchors();
      const filePath = join(tempDir, 'empty.json');

      await saveSelectorsAnchors(filePath, empty);
      const loaded = await loadSelectorsAnchors(filePath);

      expect(loaded).toEqual(empty);
    });
  });
});
