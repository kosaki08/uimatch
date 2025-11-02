/**
 * Test childBox capture with childSelector
 */
import { describe, expect, test } from 'bun:test';
import { captureTarget } from './playwright';

describe('Playwright childBox capture', () => {
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
