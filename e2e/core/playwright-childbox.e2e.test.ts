/**
 * Test childBox capture with childSelector
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { browserPool } from '../../packages/uimatch-core/src/adapters/browser-pool';
import { captureTarget } from '../../packages/uimatch-core/src/adapters/playwright';

const TEST_TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 15000);
const itT = (name: string, fn: () => Promise<void>) => test(name, fn, { timeout: TEST_TIMEOUT });

// Gate E2E tests behind environment variable to prevent heavy browser tests during unit test runs
const ENABLE_E2E = process.env.UIMATCH_ENABLE_BROWSER_TESTS === 'true';
const run = ENABLE_E2E ? describe : describe.skip;

run('Playwright childBox capture - with childSelector', () => {
  itT('should capture childBox for CSS child selector', async () => {
    const html = `
      <div id="parent" style="width: 400px; height: 300px; position: relative;">
        <button id="child" style="width: 100px; height: 50px; position: absolute; left: 20px; top: 30px;">
          Click me
        </button>
      </div>
    `;

    const result = await captureTarget({
      html,
      selector: '#parent',
      childSelector: '#child',
      reuseBrowser: true,
      idleWaitMs: 0,
    });

    expect(result.childBox).toBeDefined();
    expect(result.childBox?.width).toBeGreaterThan(0);
    expect(result.childBox?.height).toBeGreaterThan(0);
  });

  itT('should not fail when childSelector not found', async () => {
    const html = `<div id="parent">No child</div>`;

    const result = await captureTarget({
      html,
      selector: '#parent',
      childSelector: '#nonexistent',
      reuseBrowser: true,
      idleWaitMs: 0,
    });

    expect(result.childBox).toBeUndefined();
    expect(result.implPng).toBeDefined();
  });
});

run('Playwright childBox capture - without childSelector', () => {
  itT('should work without childSelector', async () => {
    const html = `<div id="parent">Content</div>`;

    const result = await captureTarget({
      html,
      selector: '#parent',
      reuseBrowser: true,
      idleWaitMs: 0,
    });

    expect(result.childBox).toBeUndefined();
    expect(result.implPng).toBeDefined();
  });
});

// Cleanup: Close all browser instances to prevent process leakage
afterAll(async () => {
  try {
    await browserPool.closeAll();
  } catch {
    // Ignore cleanup errors
  }
});
