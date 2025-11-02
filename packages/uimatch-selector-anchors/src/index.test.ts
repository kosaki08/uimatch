import { describe, expect, test } from 'bun:test';
import plugin from './index.js';
import type { Probe, ProbeResult } from './spi.js';

/**
 * Mock Probe for testing
 */
class MockProbe implements Probe {
  async check(selector: string): Promise<ProbeResult> {
    // Simulate async operation
    await Promise.resolve();

    return {
      selector,
      isValid: true,
      isAlive: true,
      checkTime: 10,
    };
  }
}

describe('@uimatch/selector-anchors', () => {
  test('plugin has correct metadata', () => {
    expect(plugin.name).toBe('@uimatch/selector-anchors');
    expect(plugin.version).toBe('0.1.0');
    expect(typeof plugin.resolve).toBe('function');
  });

  test('plugin health check passes', async () => {
    if (!plugin.healthCheck) {
      throw new Error('healthCheck method not implemented');
    }

    const result = await plugin.healthCheck();
    expect(result.healthy).toBe(true);
  });

  test('resolve returns initial selector when no anchors provided', async () => {
    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '.my-button',
      probe: new MockProbe(),
    });

    expect(result.selector).toBe('.my-button');
    expect(result.reasons).toContain('No anchors file provided, using initial selector');
  });

  test('resolve handles non-existent anchors file gracefully', async () => {
    const result = await plugin.resolve({
      url: 'http://localhost:3000',
      initialSelector: '.my-button',
      anchorsPath: '/non/existent/path.json',
      probe: new MockProbe(),
    });

    expect(result.selector).toBe('.my-button');
    expect(result.error).toBeDefined();
    expect(result.reasons).toContain('Failed to load anchors file, using initial selector');
  });
});
