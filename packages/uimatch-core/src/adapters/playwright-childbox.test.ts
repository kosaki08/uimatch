/**
 * Test childBox capture with childSelector
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { browserPool } from './browser-pool';
import { captureTarget } from './playwright';

// Configure environment for faster E2E tests
beforeAll(() => {
  process.env.UIMATCH_HEADLESS = process.env.UIMATCH_HEADLESS ?? 'true';
  process.env.UIMATCH_SELECTOR_FIRST = process.env.UIMATCH_SELECTOR_FIRST ?? 'true';
  process.env.UIMATCH_SET_CONTENT_TIMEOUT_MS = process.env.UIMATCH_SET_CONTENT_TIMEOUT_MS ?? '1000';
  process.env.UIMATCH_NAV_TIMEOUT_MS = process.env.UIMATCH_NAV_TIMEOUT_MS ?? '1200';
  process.env.UIMATCH_SELECTOR_WAIT_MS = process.env.UIMATCH_SELECTOR_WAIT_MS ?? '2000';
  process.env.UIMATCH_BBOX_TIMEOUT_MS = process.env.UIMATCH_BBOX_TIMEOUT_MS ?? '600';
  process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS = process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS ?? '800';
  process.env.UIMATCH_PROBE_TIMEOUT_MS = process.env.UIMATCH_PROBE_TIMEOUT_MS ?? '500';
});

describe('Playwright childBox capture - with childSelector', () => {
  beforeAll(async () => {
    await browserPool.getBrowser();
  });

  test('should capture childBox for CSS child selector', async () => {
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
    });

    expect(result.childBox).toBeDefined();
    expect(result.childBox?.width).toBeGreaterThan(0);
    expect(result.childBox?.height).toBeGreaterThan(0);
  });

  test('should not fail when childSelector not found', async () => {
    const html = `<div id="parent">No child</div>`;

    const result = await captureTarget({
      html,
      selector: '#parent',
      childSelector: '#nonexistent',
    });

    expect(result.childBox).toBeUndefined();
    expect(result.implPng).toBeDefined();
  });
});

describe('Playwright childBox capture - without childSelector', () => {
  beforeAll(async () => {
    await browserPool.getBrowser();
  });

  afterAll(async () => {
    await browserPool.closeAll();
  });

  // NOTE: This test passes when run individually but hangs when run after other tests
  // This is likely due to browser pool resource management issues
  // TODO: Investigate and fix browser pool cleanup between tests
  // Workaround: Run this test file with `-t "should work without childSelector"` to test individually
  test('should work without childSelector', async () => {
    const html = `<div id="parent">Content</div>`;

    const result = await captureTarget({
      html,
      selector: '#parent',
    });

    expect(result.childBox).toBeUndefined();
    expect(result.implPng).toBeDefined();
  });
});
