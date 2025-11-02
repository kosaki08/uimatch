/**
 * E2E test for selector resolution plugin
 *
 * Tests complete flow: anchor → AST resolution → liveness check → score → writeBack
 * Creates temporary TSX file and anchors.json to simulate real workflow
 */

import type { SelectorAnchor, SelectorsData } from '@uimatch/selector-anchors';
import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENABLE_E2E_TESTS = process.env.UIMATCH_ENABLE_E2E_TESTS === 'true';
const runE2E = ENABLE_E2E_TESTS ? describe : describe.skip;

if (!ENABLE_E2E_TESTS) {
  console.warn(
    '[uimatch] Skipping selector-anchors E2E tests (set UIMATCH_ENABLE_E2E_TESTS=true to enable)'
  );
}

runE2E('Selector resolution E2E', () => {
  test('complete flow: anchor → AST → liveness → score → writeBack', async () => {
    // Create temporary directory
    const tmpDir = await mkdtemp(join(tmpdir(), 'uimatch-e2e-'));

    try {
      // Create a simple TSX component file
      const componentPath = join(tmpDir, 'Button.tsx');
      const componentCode = `
import React from 'react';

export function Button() {
  return (
    <button data-testid="submit-btn" className="btn btn-primary">
      Submit
    </button>
  );
}
`;
      await writeFile(componentPath, componentCode, 'utf-8');

      // Create anchors.json with anchor pointing to component
      const anchorsPath = join(tmpDir, 'anchors.json');
      const initialAnchors: SelectorsData = {
        version: '1.0',
        anchors: [
          {
            id: 'submit-button',
            componentName: 'Button',
            snippetHash: 'test-hash-123',
            subselector: '[data-testid="submit-btn"]',
            lastKnownSelector: '[data-testid="submit-btn"]',
            stabilityScore: 95,
            sourceFilePath: componentPath,
            sourceFileLineRange: [4, 8],
            rawSnippet: '<button data-testid="submit-btn"',
            detectedTestId: 'submit-btn',
            detectedRole: 'button',
          } satisfies SelectorAnchor,
        ],
      };
      await writeFile(anchorsPath, JSON.stringify(initialAnchors, null, 2), 'utf-8');

      // Import plugin and resolve
      const plugin = await import('@uimatch/selector-anchors');

      // Mock probe that validates testid selector
      const mockProbe = {
        async check(selector: string): Promise<{
          selector: string;
          isValid: boolean;
          isAlive: boolean;
          checkTime: number;
        }> {
          await Promise.resolve(); // Simulate async
          return {
            selector,
            isValid: selector === '[data-testid="submit-btn"]',
            isAlive: selector === '[data-testid="submit-btn"]',
            checkTime: 5,
          };
        },
      };

      // Resolve with writeBack enabled
      const result = await plugin.default.resolve({
        url: 'http://localhost:3000',
        initialSelector: '.btn-primary',
        anchorsPath,
        writeBack: true,
        probe: mockProbe,
      });

      // Verify resolution
      expect(result.selector).toBe('[data-testid="submit-btn"]');
      expect(result.stabilityScore).toBeDefined();
      expect(result.stabilityScore).toBeGreaterThan(0);
      expect(result.reasons).toBeDefined();
      expect(result.reasons?.length).toBeGreaterThan(0);

      // Verify anchor was matched
      expect(result.reasons?.some((r) => r.includes('submit-button'))).toBe(true);

      // Verify updatedAnchors includes updated data
      expect(result.updatedAnchors).toBeDefined();
      expect(result.updatedAnchors?.version).toBe('1.0');
      expect(result.updatedAnchors?.anchors).toHaveLength(1);

      // Verify anchor was updated with AST data
      if (result.updatedAnchors) {
        const anchors = result.updatedAnchors.anchors as SelectorAnchor[];
        expect(anchors.length).toBeGreaterThan(0);
        const updatedAnchor = anchors[0];
        if (updatedAnchor) {
          expect(updatedAnchor.id).toBe('submit-button');
          expect(updatedAnchor.subselector).toBe('[data-testid="submit-btn"]');

          // Verify liveness tracking
          expect(updatedAnchor.lastSeen).toBeDefined();
          expect(updatedAnchor.lastMatchedAt).toBeDefined();
        }
      }
    } finally {
      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('handles dompath subselector in anchor', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'uimatch-e2e-'));

    try {
      const componentPath = join(tmpDir, 'Form.tsx');
      const componentCode = `
import React from 'react';

export function Form() {
  return (
    <form>
      <label>Email</label>
      <input type="email" name="email" />
    </form>
  );
}
`;
      await writeFile(componentPath, componentCode, 'utf-8');

      const anchorsPath = join(tmpDir, 'anchors.json');
      const anchors: SelectorsData = {
        version: '1.0',
        anchors: [
          {
            id: 'email-input',
            componentName: 'Form',
            snippetHash: 'form-hash-456',
            subselector: 'dompath:form/label/input[type="email"]',
            lastKnownSelector: 'input[type="email"][name="email"]',
            stabilityScore: 80,
            sourceFilePath: componentPath,
            sourceFileLineRange: [6, 8],
            rawSnippet: '<input type="email"',
          } satisfies SelectorAnchor,
        ],
      };
      await writeFile(anchorsPath, JSON.stringify(anchors, null, 2), 'utf-8');

      const plugin = await import('@uimatch/selector-anchors');

      const mockProbe = {
        async check(selector: string): Promise<{
          selector: string;
          isValid: boolean;
          isAlive: boolean;
          checkTime: number;
        }> {
          await Promise.resolve(); // Simulate async
          return {
            selector,
            isValid: selector === 'input[type="email"][name="email"]',
            isAlive: selector === 'input[type="email"][name="email"]',
            checkTime: 5,
          };
        },
      };

      const result = await plugin.default.resolve({
        url: 'http://localhost:3000',
        initialSelector: 'input[type="email"]',
        anchorsPath,
        probe: mockProbe,
      });

      // Should resolve to last known selector
      expect(result.selector).toBe('input[type="email"][name="email"]');
      expect(result.reasons?.some((r) => r.includes('email-input'))).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('writeBack preserves unmatched anchors', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'uimatch-e2e-'));

    try {
      const componentPath = join(tmpDir, 'MultiButton.tsx');
      const componentCode = `
import React from 'react';

export function MultiButton() {
  return (
    <div>
      <button data-testid="submit">Submit</button>
      <button data-testid="cancel">Cancel</button>
    </div>
  );
}
`;
      await writeFile(componentPath, componentCode, 'utf-8');

      const anchorsPath = join(tmpDir, 'anchors.json');
      const anchors: SelectorsData = {
        version: '1.0',
        anchors: [
          {
            id: 'submit-btn',
            componentName: 'MultiButton',
            snippetHash: 'hash-1',
            subselector: '[data-testid="submit"]',
            lastKnownSelector: '[data-testid="submit"]',
            stabilityScore: 90,
            sourceFilePath: componentPath,
            sourceFileLineRange: [6, 6],
            rawSnippet: '<button data-testid="submit"',
          } satisfies SelectorAnchor,
          {
            id: 'cancel-btn',
            componentName: 'MultiButton',
            snippetHash: 'hash-2',
            subselector: '[data-testid="cancel"]',
            lastKnownSelector: '[data-testid="cancel"]',
            stabilityScore: 85,
            sourceFilePath: componentPath,
            sourceFileLineRange: [7, 7],
            rawSnippet: '<button data-testid="cancel"',
          } satisfies SelectorAnchor,
        ],
      };
      await writeFile(anchorsPath, JSON.stringify(anchors, null, 2), 'utf-8');

      const plugin = await import('@uimatch/selector-anchors');

      const mockProbe = {
        async check(selector: string): Promise<{
          selector: string;
          isValid: boolean;
          isAlive: boolean;
          checkTime: number;
        }> {
          await Promise.resolve(); // Simulate async
          return {
            selector,
            isValid: selector === '[data-testid="submit"]',
            isAlive: selector === '[data-testid="submit"]',
            checkTime: 5,
          };
        },
      };

      // Only match submit button
      const result = await plugin.default.resolve({
        url: 'http://localhost:3000',
        initialSelector: '[data-testid="submit"]',
        anchorsPath,
        writeBack: true,
        probe: mockProbe,
      });

      expect(result.updatedAnchors).toBeDefined();
      // Both anchors should be preserved
      expect(result.updatedAnchors?.anchors).toHaveLength(2);

      // Only matched anchor should have updated timestamp
      if (result.updatedAnchors) {
        const anchors = result.updatedAnchors.anchors as SelectorAnchor[];
        const submitAnchor = anchors.find((a) => a.id === 'submit-btn');
        const cancelAnchor = anchors.find((a) => a.id === 'cancel-btn');

        expect(submitAnchor?.lastMatchedAt).toBeDefined();
        // Cancel anchor shouldn't have new match timestamp (if it wasn't matched before)
        // but should still exist in the output
        expect(cancelAnchor).toBeDefined();
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
