/**
 * Tests for enhanced selector system with prefix support
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { browserPool } from './browser-pool';
import { PlaywrightAdapter } from './playwright';

// Clean up browser pool after all tests
afterAll(async () => {
  await browserPool.closeAll();
});

describe('PlaywrightAdapter - Enhanced Selectors', () => {
  const testHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
          .header { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="header">Test Page</div>
        <button class="button" role="button" data-testid="submit-btn" type="button">Submit</button>
        <p>Click the button to continue</p>
        <a href="#docs">View docs</a>
      </body>
    </html>
  `;

  test('CSS selector (no prefix) - backward compatible', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: '.button',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.implPng.length).toBeGreaterThan(0);
    expect(result.styles['__self__']).toBeDefined();
  });

  test('CSS selector with explicit prefix', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'css:.button',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  test('testid: selector', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'testid:submit-btn',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
    expect(result.meta).toBeDefined();
    expect(result.meta?.['__self__']?.testid).toBe('submit-btn');
  });

  test('text: selector with double quotes', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'text:"Submit"',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  test('text: selector with single quotes', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: "text:'Submit'",
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  test('text: selector with escape sequences', async () => {
    const htmlWithEscapes = `
      <!DOCTYPE html>
      <html>
        <body>
          <p>Text with "quotes" and 'apostrophes'</p>
          <p>Line 1
Line 2</p>
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });

    // Test escaped quotes
    const result1 = await adapter.captureTarget({
      html: htmlWithEscapes,
      selector: 'text:"Text with \\"quotes\\" and \'apostrophes\'"',
      idleWaitMs: 0,
    });
    expect(result1.implPng).toBeInstanceOf(Buffer);

    // Test newline escape
    const result2 = await adapter.captureTarget({
      html: htmlWithEscapes,
      selector: 'text:"Line 1\\nLine 2"',
      idleWaitMs: 0,
    });
    expect(result2.implPng).toBeInstanceOf(Buffer);
  });

  test('role: selector with name', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'role:button[name="Submit"]',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  test('role: selector with regex name', async () => {
    const htmlWithLink = `
      <!DOCTYPE html>
      <html>
        <body>
          <a href="#docs" role="link">View documentation</a>
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: htmlWithLink,
      selector: 'role:link[name=/doc/i]',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  test('Preserves colon in URL-like selectors', async () => {
    const htmlWithLink = `
      <!DOCTYPE html>
      <html>
        <body>
          <a href="https://example.com">Link</a>
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: htmlWithLink,
      selector: 'a[href*="https:"]',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });
});
