/**
 * E2E test for selector resolution plugin
 *
 * Tests complete flow: anchor → AST resolution → liveness check → score → writeBack
 * Creates temporary TSX file and anchors.json to simulate real workflow
 */

import type { SelectorsAnchors } from '@uimatch/selector-anchors';
import type { Probe, ProbeResult, Resolution, SelectorResolverPlugin } from '@uimatch/selector-spi';
import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// E2E tests for selector resolution
describe('Selector resolution E2E', () => {
  // Set default timeout values for E2E tests
  process.env.UIMATCH_HEADLESS = process.env.UIMATCH_HEADLESS ?? 'true';
  process.env.UIMATCH_NAV_TIMEOUT_MS = process.env.UIMATCH_NAV_TIMEOUT_MS ?? '1500';
  process.env.UIMATCH_SELECTOR_WAIT_MS = process.env.UIMATCH_SELECTOR_WAIT_MS ?? '3000';
  process.env.UIMATCH_BBOX_TIMEOUT_MS = process.env.UIMATCH_BBOX_TIMEOUT_MS ?? '800';
  process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS = process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS ?? '1000';
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

      // Generate actual snippet hash for the target line
      const { generateSnippetHash } = await import('@uimatch/selector-anchors');
      const actualHash = await generateSnippetHash(
        componentPath,
        6, // line number
        { contextBefore: 0, contextAfter: 0 }
      );

      // Create anchors.json with anchor pointing to component
      const anchorsPath = join(tmpDir, 'anchors.json');
      const initialAnchors: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'submit-button',
            source: {
              file: componentPath,
              line: 6,
              col: 4,
            },
            hint: {
              prefer: ['testid', 'role'],
              testid: 'submit-btn',
              role: 'button',
            },
            snippetHash: actualHash.hash,
            snippet: '<button data-testid="submit-btn" className="btn btn-primary">',
            snippetContext: {
              contextBefore: 0,
              contextAfter: 0,
              algorithm: 'sha1' as const,
              hashDigits: 10,
            },
            subselector: '[data-testid="submit-btn"]',
            lastKnown: {
              selector: '[data-testid="submit-btn"]',
              stabilityScore: 95,
            },
            meta: {
              component: 'Button',
              description: 'Submit button',
            },
          },
        ],
      };
      await writeFile(anchorsPath, JSON.stringify(initialAnchors, null, 2), 'utf-8');

      // Import plugin and resolve
      const pluginModule = (await import('@uimatch/selector-anchors')) as {
        default: SelectorResolverPlugin;
      };
      const plugin = pluginModule.default;

      // Mock probe that validates testid selector
      const mockProbe: Probe = {
        async check(selector: string): Promise<ProbeResult> {
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
      const result: Resolution = await plugin.resolve({
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
      const ua = result.updatedAnchors as SelectorsAnchors | undefined;
      expect(ua?.version).toBe('1.0.0');
      expect(ua?.anchors).toHaveLength(1);

      // Verify anchor was updated with AST data
      if (result.updatedAnchors) {
        const updatedData = result.updatedAnchors as SelectorsAnchors;
        expect(updatedData.anchors.length).toBeGreaterThan(0);
        const updatedAnchor = updatedData.anchors[0];
        if (updatedAnchor) {
          expect(updatedAnchor.id).toBe('submit-button');
          expect(updatedAnchor.subselector).toBe('[data-testid="submit-btn"]');

          // Verify liveness tracking - check lastKnown
          expect(updatedAnchor.lastKnown).toBeDefined();
          if (updatedAnchor.lastKnown) {
            expect(updatedAnchor.lastKnown.selector).toBe('[data-testid="submit-btn"]');
            expect(updatedAnchor.lastKnown.timestamp).toBeDefined();
          }
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

      // Generate actual snippet hash
      const { generateSnippetHash } = await import('@uimatch/selector-anchors');
      const actualHash = await generateSnippetHash(
        componentPath,
        8, // line number (input element)
        { contextBefore: 0, contextAfter: 0 }
      );

      const anchorsPath = join(tmpDir, 'anchors.json');
      const anchors: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'email-input',
            source: {
              file: componentPath,
              line: 8,
              col: 6,
            },
            hint: {
              prefer: ['role', 'css'],
              role: 'textbox',
            },
            snippetHash: actualHash.hash,
            snippet: '<input type="email" name="email" />',
            snippetContext: {
              contextBefore: 0,
              contextAfter: 0,
              algorithm: 'sha1' as const,
              hashDigits: 10,
            },
            subselector: 'dompath:form/label/input[type="email"]',
            lastKnown: {
              selector: 'input[type="email"][name="email"]',
              stabilityScore: 80,
            },
            meta: {
              component: 'Form',
              description: 'Email input field',
            },
          },
        ],
      };
      await writeFile(anchorsPath, JSON.stringify(anchors, null, 2), 'utf-8');

      const pluginModule = (await import('@uimatch/selector-anchors')) as {
        default: SelectorResolverPlugin;
      };
      const plugin = pluginModule.default;

      const mockProbe: Probe = {
        async check(selector: string): Promise<ProbeResult> {
          await Promise.resolve(); // Simulate async
          return {
            selector,
            isValid: selector === 'input[type="email"][name="email"]',
            isAlive: selector === 'input[type="email"][name="email"]',
            checkTime: 5,
          };
        },
      };

      const result: Resolution = await plugin.resolve({
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

      // Generate actual snippet hashes
      const { generateSnippetHash } = await import('@uimatch/selector-anchors');
      const submitHash = await generateSnippetHash(
        componentPath,
        6, // submit button line
        { contextBefore: 0, contextAfter: 0 }
      );
      const cancelHash = await generateSnippetHash(
        componentPath,
        7, // cancel button line
        { contextBefore: 0, contextAfter: 0 }
      );

      const anchorsPath = join(tmpDir, 'anchors.json');
      const anchors: SelectorsAnchors = {
        version: '1.0.0',
        anchors: [
          {
            id: 'submit-btn',
            source: {
              file: componentPath,
              line: 6,
              col: 6,
            },
            hint: {
              prefer: ['testid'],
              testid: 'submit',
            },
            snippetHash: submitHash.hash,
            snippet: '<button data-testid="submit">Submit</button>',
            snippetContext: {
              contextBefore: 0,
              contextAfter: 0,
              algorithm: 'sha1' as const,
              hashDigits: 10,
            },
            subselector: '[data-testid="submit"]',
            lastKnown: {
              selector: '[data-testid="submit"]',
              stabilityScore: 90,
            },
            meta: {
              component: 'MultiButton',
            },
          },
          {
            id: 'cancel-btn',
            source: {
              file: componentPath,
              line: 7,
              col: 6,
            },
            hint: {
              prefer: ['testid'],
              testid: 'cancel',
            },
            snippetHash: cancelHash.hash,
            snippet: '<button data-testid="cancel">Cancel</button>',
            snippetContext: {
              contextBefore: 0,
              contextAfter: 0,
              algorithm: 'sha1' as const,
              hashDigits: 10,
            },
            subselector: '[data-testid="cancel"]',
            lastKnown: {
              selector: '[data-testid="cancel"]',
              stabilityScore: 85,
            },
            meta: {
              component: 'MultiButton',
            },
          },
        ],
      };
      await writeFile(anchorsPath, JSON.stringify(anchors, null, 2), 'utf-8');

      const pluginModule = (await import('@uimatch/selector-anchors')) as {
        default: SelectorResolverPlugin;
      };
      const plugin = pluginModule.default;

      const mockProbe: Probe = {
        async check(selector: string): Promise<ProbeResult> {
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
      const result: Resolution = await plugin.resolve({
        url: 'http://localhost:3000',
        initialSelector: '[data-testid="submit"]',
        anchorsPath,
        writeBack: true,
        probe: mockProbe,
      });

      expect(result.updatedAnchors).toBeDefined();
      // Both anchors should be preserved
      const ua2 = result.updatedAnchors as SelectorsAnchors | undefined;
      expect(ua2?.anchors).toHaveLength(2);

      // Only matched anchor should have updated timestamp
      if (result.updatedAnchors) {
        const updatedData = result.updatedAnchors as SelectorsAnchors;
        const submitAnchor = updatedData.anchors.find((a) => a.id === 'submit-btn');
        const cancelAnchor = updatedData.anchors.find((a) => a.id === 'cancel-btn');

        expect(submitAnchor).toBeDefined();
        expect(submitAnchor?.lastKnown).toBeDefined();
        if (submitAnchor?.lastKnown) {
          expect(submitAnchor.lastKnown.timestamp).toBeDefined();
        }
        // Cancel anchor shouldn't have new match timestamp (if it wasn't matched before)
        // but should still exist in the output
        expect(cancelAnchor).toBeDefined();
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
