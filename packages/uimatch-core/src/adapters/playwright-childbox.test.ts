/* eslint-disable no-console */
/**
 * Test childBox capture with childSelector
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { browserPool } from './browser-pool';
import { captureTarget } from './playwright';

const TEST_TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 15000);
const itT = (name: string, fn: () => Promise<void>) => test(name, fn, { timeout: TEST_TIMEOUT });

const ENABLE_BROWSER_TESTS = process.env.UIMATCH_ENABLE_BROWSER_TESTS === 'true';
const run = ENABLE_BROWSER_TESTS ? describe : describe.skip;

if (!ENABLE_BROWSER_TESTS) {
  console.warn(
    '[uimatch] Skipping Playwright integration tests (set UIMATCH_ENABLE_BROWSER_TESTS=true to enable)'
  );
}

// Configure environment for faster E2E tests and warm up browser
if (ENABLE_BROWSER_TESTS) {
  beforeAll(async () => {
    process.env.UIMATCH_HEADLESS = process.env.UIMATCH_HEADLESS ?? 'true';
    process.env.UIMATCH_SELECTOR_FIRST = process.env.UIMATCH_SELECTOR_FIRST ?? 'true';
    process.env.UIMATCH_SET_CONTENT_TIMEOUT_MS =
      process.env.UIMATCH_SET_CONTENT_TIMEOUT_MS ?? '1000';
    process.env.UIMATCH_NAV_TIMEOUT_MS = process.env.UIMATCH_NAV_TIMEOUT_MS ?? '1200';
    process.env.UIMATCH_SELECTOR_WAIT_MS = process.env.UIMATCH_SELECTOR_WAIT_MS ?? '2000';
    process.env.UIMATCH_BBOX_TIMEOUT_MS = process.env.UIMATCH_BBOX_TIMEOUT_MS ?? '600';
    process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS = process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS ?? '800';
    process.env.UIMATCH_PROBE_TIMEOUT_MS = process.env.UIMATCH_PROBE_TIMEOUT_MS ?? '500';

    // Warm up browser once at the start to avoid parallel launch races
    await browserPool.getBrowser();
  });
}

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
    });

    expect(result.childBox).toBeUndefined();
    expect(result.implPng).toBeDefined();
  });
});

if (ENABLE_BROWSER_TESTS) {
  afterAll(async () => {
    await browserPool.closeAll();
  });
}
