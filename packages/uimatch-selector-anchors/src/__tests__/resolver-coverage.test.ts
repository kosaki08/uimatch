/**
 * Comprehensive resolver tests for coverage improvement
 * Targets uncovered branches in resolver.ts, io.ts, and liveness.ts
 */

import type { Probe, ProbeResult } from '@uimatch/selector-spi';
import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { resolve as resolvePath } from 'node:path';
import { isLive, resolve, resolveProjectPath } from '../core/resolver.js';
import * as findSnippetMatchModule from '../hashing/snippet-hash.js';
import * as astResolverModule from '../resolvers/ast-resolver.js';
import type { SelectorsAnchors } from '../types/schema.js';
import * as ioModule from '../utils/io.js';

/**
 * Mock Probe implementation for controlled testing
 */
class MockProbe implements Probe {
  private responses: Map<string, ProbeResult>;
  private defaultResponse: ProbeResult;

  constructor(responses: Record<string, ProbeResult> = {}) {
    this.responses = new Map(Object.entries(responses));
    this.defaultResponse = {
      selector: '',
      isValid: false,
      isAlive: false,
      checkTime: 0,
    };
  }

  async check(selector: string): Promise<ProbeResult> {
    await Promise.resolve(); // Satisfy require-await
    return this.responses.get(selector) ?? { ...this.defaultResponse, selector };
  }

  setResponse(selector: string, result: ProbeResult): void {
    this.responses.set(selector, result);
  }
}

describe('Resolver Coverage Tests', () => {
  describe('resolveProjectPath', () => {
    test('returns absolute path as-is', () => {
      const absolutePath = '/absolute/path/to/file.ts';
      const result = resolveProjectPath('/project/anchors.json', absolutePath);
      expect(result).toBe(absolutePath);
    });

    test('resolves relative path relative to anchors directory', () => {
      const anchorsPath = '/project/configs/anchors.json';
      const relativePath = '../src/Button.tsx';
      const result = resolveProjectPath(anchorsPath, relativePath);
      expect(result).toBe(resolvePath('/project/src/Button.tsx'));
    });

    test('resolves simple relative path', () => {
      const anchorsPath = '/project/anchors.json';
      const relativePath = 'components/Button.tsx';
      const result = resolveProjectPath(anchorsPath, relativePath);
      expect(result).toBe(resolvePath('/project/components/Button.tsx'));
    });
  });

  describe('isLive', () => {
    test('returns true for isAlive: true', () => {
      expect(isLive({ isAlive: true })).toBe(true);
    });

    test('returns true for isValid: true', () => {
      expect(isLive({ isValid: true })).toBe(true);
    });

    test('returns false for isAlive: false', () => {
      expect(isLive({ isAlive: false })).toBe(false);
    });

    test('returns false for non-object', () => {
      expect(isLive(null)).toBe(false);
      expect(isLive(undefined)).toBe(false);
      expect(isLive('string')).toBe(false);
      expect(isLive(42)).toBe(false);
    });

    test('returns false for object without isAlive or isValid', () => {
      expect(isLive({})).toBe(false);
      expect(isLive({ other: true })).toBe(false);
    });

    test('prefers isAlive over isValid', () => {
      expect(isLive({ isAlive: true, isValid: false })).toBe(true);
      expect(isLive({ isAlive: false, isValid: true })).toBe(false);
    });
  });

  describe('resolve - No Anchors Cases', () => {
    test('returns initial selector when no anchorsPath provided', async () => {
      const probe = new MockProbe();
      const result = await resolve({
        initialSelector: '.test-selector',
        anchorsPath: undefined,
        probe,
      });

      expect(result.selector).toBe('.test-selector');
      expect(result.reasons).toContain('No anchors file provided, using initial selector');
    });
  });

  describe('resolve - Load Anchors Failures', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('handles ENOENT (file not found) gracefully', async () => {
      const probe = new MockProbe();
      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      const error: NodeJS.ErrnoException = new Error('File not found');
      error.code = 'ENOENT';
      loadSpy.mockRejectedValueOnce(error);

      const result = await resolve({
        initialSelector: '.fallback',
        anchorsPath: './nonexistent.json',
        probe,
      });

      expect(result.selector).toBe('.fallback');
      expect(result.error).toBeDefined();
      expect(result.reasons).toContain('Failed to load anchors file, using initial selector');

      loadSpy.mockRestore();
    });

    test('handles JSON SyntaxError gracefully', async () => {
      const probe = new MockProbe();
      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockRejectedValueOnce(new SyntaxError('Unexpected token'));

      const result = await resolve({
        initialSelector: '.fallback',
        anchorsPath: './broken.json',
        probe,
      });

      expect(result.selector).toBe('.fallback');
      expect(result.error).toBeDefined();
      expect(result.reasons).toContain('Failed to load anchors file, using initial selector');

      loadSpy.mockRestore();
    });

    test('handles schema validation error gracefully', async () => {
      const probe = new MockProbe();
      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockRejectedValueOnce(new Error('Invalid anchors JSON schema'));

      const result = await resolve({
        initialSelector: '.fallback',
        anchorsPath: './invalid-schema.json',
        probe,
      });

      expect(result.selector).toBe('.fallback');
      expect(result.error).toBeDefined();

      loadSpy.mockRestore();
    });
  });

  describe('resolve - Cached resolvedCss Paths', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('uses cached resolvedCss when still alive', async () => {
      const probe = new MockProbe({
        '[data-testid="cached"]': {
          selector: '[data-testid="cached"]',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
      });

      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'test-anchor',
            hint: { prefer: ['testid'] },
            resolvedCss: '[data-testid="cached"]',
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockResolvedValueOnce(anchorsData);

      const result = await resolve({
        initialSelector: '[data-testid="cached"]',
        anchorsPath: './anchors.json',
        probe,
      });

      expect(result.selector).toBe('[data-testid="cached"]');
      expect(result.stabilityScore).toBeUndefined(); // Undefined for cached selectors
      expect(result.reasons?.some((r) => r.includes('Cached selector is still alive'))).toBe(true);

      loadSpy.mockRestore();
    });

    test('re-resolves when cached resolvedCss is dead', async () => {
      const probe = new MockProbe({
        '[data-testid="dead-cache"]': {
          selector: '[data-testid="dead-cache"]',
          isValid: false,
          isAlive: false,
          checkTime: 5,
        },
        '[data-testid="new-selector"]': {
          selector: '[data-testid="new-selector"]',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
      });

      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'test-anchor',
            hint: { prefer: ['testid'] },
            resolvedCss: '[data-testid="dead-cache"]',
            snippetHash: 'abc123',
            snippet: '<button data-testid="new-selector">',
            snippetContext: { contextBefore: 2, contextAfter: 2 },
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockResolvedValueOnce(anchorsData);

      const findSnippetSpy = vi.spyOn(findSnippetMatchModule, 'findSnippetMatch');
      findSnippetSpy.mockResolvedValueOnce(15); // Matched at line 15

      const astResolveSpy = vi.spyOn(astResolverModule, 'resolveFromTypeScript');
      astResolveSpy.mockResolvedValueOnce({
        selectors: ['[data-testid="new-selector"]'],
        hint: { prefer: ['testid'] },
      });

      const result = await resolve({
        initialSelector: '[data-testid="dead-cache"]',
        anchorsPath: './anchors.json',
        probe,
      });

      expect(result.selector).toBe('[data-testid="new-selector"]');
      expect(result.stabilityScore).toBeGreaterThan(0);
      expect(result.reasons?.some((r) => r.includes('Cached selector is no longer alive'))).toBe(
        true
      );

      loadSpy.mockRestore();
      findSnippetSpy.mockRestore();
      astResolveSpy.mockRestore();
    });
  });

  describe('resolve - Snippet Hash Matching', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('handles snippet not found (code moved)', async () => {
      const probe = new MockProbe();
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'moved-code',
            hint: { prefer: ['testid'] },
            snippetHash: 'hash123',
            snippet: '<button>',
            snippetContext: { contextBefore: 3, contextAfter: 3 },
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockResolvedValueOnce(anchorsData);

      const findSnippetSpy = vi.spyOn(findSnippetMatchModule, 'findSnippetMatch');
      findSnippetSpy.mockResolvedValueOnce(null); // Snippet not found

      const result = await resolve({
        initialSelector: '.moved',
        anchorsPath: './anchors.json',
        probe,
      });

      expect(result.selector).toBe('.moved');
      expect(result.reasons?.some((r) => r.includes('Snippet hash did not match'))).toBe(true);

      loadSpy.mockRestore();
      findSnippetSpy.mockRestore();
    });

    test('handles snippet match error', async () => {
      const probe = new MockProbe();
      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'error-case',
            hint: { prefer: ['testid'] },
            snippetHash: 'hash456',
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockResolvedValueOnce(anchorsData);

      const findSnippetSpy = vi.spyOn(findSnippetMatchModule, 'findSnippetMatch');
      findSnippetSpy.mockRejectedValueOnce(new Error('Read error'));

      const result = await resolve({
        initialSelector: '.error',
        anchorsPath: './anchors.json',
        probe,
      });

      expect(result.selector).toBe('.error');
      expect(result.reasons?.some((r) => r.includes('Snippet resolution error: Read error'))).toBe(
        true
      );

      loadSpy.mockRestore();
      findSnippetSpy.mockRestore();
    });
  });

  describe('resolve - WriteBack Functionality', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('calls postWrite hook on successful resolution with writeBack', async () => {
      const probe = new MockProbe({
        '[data-testid="new"]': {
          selector: '[data-testid="new"]',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
      });

      const postWrite = vi.fn().mockResolvedValue(undefined);

      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'writeback-test',
            hint: { prefer: ['testid'] },
            snippetHash: 'wb123',
            snippet: '<button>',
            snippetContext: { contextBefore: 2, contextAfter: 2 },
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockResolvedValueOnce(anchorsData);

      const findSnippetSpy = vi.spyOn(findSnippetMatchModule, 'findSnippetMatch');
      findSnippetSpy.mockResolvedValueOnce(10);

      const astResolveSpy = vi.spyOn(astResolverModule, 'resolveFromTypeScript');
      astResolveSpy.mockResolvedValueOnce({
        selectors: ['[data-testid="new"]'],
        hint: { prefer: ['testid'] },
      });

      const result = await resolve({
        initialSelector: '.old',
        anchorsPath: './anchors.json',
        writeBack: true,
        postWrite,
        probe,
      });

      expect(result.selector).toBe('[data-testid="new"]');
      expect(postWrite).toHaveBeenCalledTimes(1);

      const postWriteCall = postWrite.mock.calls[0];
      expect(postWriteCall[0]).toBe('./anchors.json');

      const savedAnchors = postWriteCall[1] as SelectorsAnchors;
      expect(savedAnchors.version).toBe('1.0.0');
      expect(savedAnchors.anchors).toHaveLength(1);
      expect(savedAnchors.anchors[0].id).toBe('writeback-test');
      expect(savedAnchors.anchors[0].resolvedCss).toBe('[data-testid="new"]');
      expect(savedAnchors.anchors[0].lastKnown?.selector).toBe('[data-testid="new"]');
      expect(result.reasons?.some((r) => r.includes('persisted via postWrite hook'))).toBe(true);

      loadSpy.mockRestore();
      findSnippetSpy.mockRestore();
      astResolveSpy.mockRestore();
    });

    test('handles postWrite hook failure gracefully', async () => {
      const probe = new MockProbe({
        '[data-testid="new"]': {
          selector: '[data-testid="new"]',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
      });

      const postWrite = vi.fn().mockRejectedValue(new Error('Write failed'));

      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'writeback-fail',
            hint: { prefer: ['testid'] },
            snippetHash: 'wbf123',
            snippet: '<button>',
            snippetContext: { contextBefore: 2, contextAfter: 2 },
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockResolvedValueOnce(anchorsData);

      const findSnippetSpy = vi.spyOn(findSnippetMatchModule, 'findSnippetMatch');
      findSnippetSpy.mockResolvedValueOnce(10);

      const astResolveSpy = vi.spyOn(astResolverModule, 'resolveFromTypeScript');
      astResolveSpy.mockResolvedValueOnce({
        selectors: ['[data-testid="new"]'],
        hint: { prefer: ['testid'] },
      });

      const result = await resolve({
        initialSelector: '.old',
        anchorsPath: './anchors.json',
        writeBack: true,
        postWrite,
        probe,
      });

      expect(result.selector).toBe('[data-testid="new"]');
      expect(postWrite).toHaveBeenCalledTimes(1);
      expect(result.updatedAnchors).toBeDefined();
      expect(result.reasons?.some((r) => r.includes('postWrite hook failed'))).toBe(true);

      loadSpy.mockRestore();
      findSnippetSpy.mockRestore();
      astResolveSpy.mockRestore();
    });

    test('prepares updatedAnchors when no postWrite hook provided', async () => {
      const probe = new MockProbe({
        '[data-testid="new"]': {
          selector: '[data-testid="new"]',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
      });

      const anchorsData: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'no-hook',
            hint: { prefer: ['testid'] },
            snippetHash: 'nh123',
            snippet: '<button>',
            snippetContext: { contextBefore: 2, contextAfter: 2 },
            source: { file: 'test.tsx', line: 10, col: 5 },
          },
        ],
      };

      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockResolvedValueOnce(anchorsData);

      const findSnippetSpy = vi.spyOn(findSnippetMatchModule, 'findSnippetMatch');
      findSnippetSpy.mockResolvedValueOnce(10);

      const astResolveSpy = vi.spyOn(astResolverModule, 'resolveFromTypeScript');
      astResolveSpy.mockResolvedValueOnce({
        selectors: ['[data-testid="new"]'],
        hint: { prefer: ['testid'] },
      });

      const result = await resolve({
        initialSelector: '.old',
        anchorsPath: './anchors.json',
        writeBack: true,
        probe,
      });

      expect(result.selector).toBe('[data-testid="new"]');
      expect(result.updatedAnchors).toBeDefined();
      expect(result.reasons?.some((r) => r.includes('host will write to file'))).toBe(true);

      loadSpy.mockRestore();
      findSnippetSpy.mockRestore();
      astResolveSpy.mockRestore();
    });
  });

  describe('resolve - Top-level Error Handling', () => {
    test('handles unexpected exception gracefully', async () => {
      const probe = new MockProbe();
      const loadSpy = vi.spyOn(ioModule, 'loadSelectorsAnchors');
      loadSpy.mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      const result = await resolve({
        initialSelector: '.fallback',
        anchorsPath: './error.json',
        probe,
      });

      expect(result.selector).toBe('.fallback');
      expect(result.error).toBeDefined();
      // The error is caught and converted to "Failed to load anchors file" message
      expect(result.reasons).toContain('Failed to load anchors file, using initial selector');

      loadSpy.mockRestore();
    });
  });
});
