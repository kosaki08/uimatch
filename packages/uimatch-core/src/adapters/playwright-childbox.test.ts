/**
 * Test childBox capture with childSelector
 */
import { describe, expect, test } from 'bun:test';
import { captureTarget } from './playwright';

const TEST_TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 15000);
const itT = (name: string, fn: () => Promise<void>) => test(name, fn, { timeout: TEST_TIMEOUT });

// Browser tests always enabled in test:all
const run = describe;

// Configure environment for faster E2E tests and warm up browser

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
