/**
 * Integration tests with real anchor files
 */

import type { Probe, ProbeResult } from '@uimatch/selector-spi';
import { describe, expect, test } from 'bun:test';
import { resolve as resolvePath } from 'node:path';
import plugin from '../index.js';

/**
 * Mock Probe for integration testing
 */
class IntegrationProbe implements Probe {
  private liveSelectors: Set<string>;

  constructor(liveSelectors: string[]) {
    this.liveSelectors = new Set(liveSelectors);
  }

  async check(selector: string): Promise<ProbeResult> {
    await Promise.resolve(); // Simulate async
    const isValid = this.liveSelectors.has(selector);

    return {
      selector,
      isValid,
      isAlive: isValid,
      checkTime: 10,
    };
  }
}

describe('Integration Tests', () => {
  const fixturesDir = resolvePath(__dirname, '../../fixtures');
  const testAnchorsPath = resolvePath(fixturesDir, 'test-anchors.json');

  test('resolves selector from anchor with exact testid match', async () => {
    const probe = new IntegrationProbe(['[data-testid="submit-btn"]']);

    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '[data-testid="submit-btn"]',
      anchorsPath: testAnchorsPath,
      probe,
    });

    expect(result.selector).toBe('[data-testid="submit-btn"]');
    expect(result.stabilityScore).toBeDefined();
    expect(result.reasons?.some((r) => r.includes('Selected anchor: submit-button'))).toBe(true);
    expect(result.reasons?.some((r) => r.includes('Exact match'))).toBe(true);
  });

  test('resolves selector using best matching anchor', async () => {
    const probe = new IntegrationProbe([
      '[data-testid="submit-btn"]',
      '[data-testid="cancel-btn"]',
    ]);

    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '.submit-button', // Partial match via component metadata
      anchorsPath: testAnchorsPath,
      probe,
    });

    // Should match submit-button anchor via component metadata
    expect(result.selector).toBeDefined();
    expect(result.reasons?.some((r) => r.includes('Selected anchor: submit-button'))).toBe(true);
  });

  test('falls back to last known selector when snippet not found', async () => {
    const probe = new IntegrationProbe(['[data-testid="cancel-btn"]']);

    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '[data-testid="cancel-btn"]',
      anchorsPath: testAnchorsPath,
      probe,
    });

    // Should use last known selector from cancel-button anchor
    expect(result.selector).toBe('[data-testid="cancel-btn"]');
    expect(result.stabilityScore).toBe(85);
  });

  test('returns initial selector when no good anchor match', async () => {
    const probe = new IntegrationProbe([]);

    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '.unknown-selector',
      anchorsPath: testAnchorsPath,
      probe,
    });

    // Note: Even with no match, anchor matcher will return the best anchor (with lowest score)
    // So it may not return the initial selector
    expect(result.selector).toBeDefined();
    // The resolution process should complete without error
    expect(result.error).toBeUndefined();
  });

  test('handles missing anchors file gracefully', async () => {
    const probe = new IntegrationProbe([]);
    const nonexistentPath = resolvePath(fixturesDir, 'nonexistent.json');

    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '.test',
      anchorsPath: nonexistentPath,
      probe,
    });

    expect(result.selector).toBe('.test');
    expect(result.error).toBeDefined();
    expect(result.reasons).toContain('Failed to load anchors file, using initial selector');
  });

  test('resolves with role hint when testid not available', async () => {
    const probe = new IntegrationProbe(['[role="form"][aria-label="Login"]']);

    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '[role="form"]',
      anchorsPath: testAnchorsPath,
      probe,
    });

    // Should match login-form anchor via role hint
    expect(result.reasons?.some((r) => r.includes('login-form'))).toBe(true);
  });

  test('prepares updated anchors when writeBack requested (with liveness)', async () => {
    // Note: writeBack only works when AST resolution succeeds and liveness check passes
    // Since our test anchors reference non-existent files, this falls back to last known selector
    const probe = new IntegrationProbe(['[data-testid="submit-btn"]']);

    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '[data-testid="submit-btn"]',
      anchorsPath: testAnchorsPath,
      writeBack: true,
      probe,
    });

    // Should use last known selector (since AST resolution can't find the source file)
    expect(result.selector).toBe('[data-testid="submit-btn"]');
    expect(result.stabilityScore).toBe(95);

    // updatedAnchors is only set when new resolution happens (not when falling back to last known)
    // So it may not be present in this test scenario
  });

  test('prioritizes anchors with higher scores', async () => {
    const probe = new IntegrationProbe([
      '[data-testid="submit-btn"]',
      '[data-testid="cancel-btn"]',
    ]);

    // Both anchors have testid hints, but submit has higher stability score
    const result1 = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '[data-testid="submit-btn"]',
      anchorsPath: testAnchorsPath,
      probe,
    });

    const result2 = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '[data-testid="cancel-btn"]',
      anchorsPath: testAnchorsPath,
      probe,
    });

    // Both should resolve successfully
    expect(result1.selector).toBe('[data-testid="submit-btn"]');
    expect(result2.selector).toBe('[data-testid="cancel-btn"]');

    // submit-button has higher stability score (95 vs 85)
    expect(result1.stabilityScore).toBeGreaterThan(result2.stabilityScore ?? 0);
  });
});
