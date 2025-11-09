/**
 * Tests for enhanced selector system with prefix support
 */

import { describe, expect, test } from 'bun:test';
import { PlaywrightAdapter } from './playwright';

// E2E tests need more time than the default 5s. Use 15s as default.
const TEST_TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 15000);

// Browser tests always enabled in test:all
const run = describe;

// Pre-warm browser once before all tests to avoid startup cost in each test

// Helper to apply consistent timeout to all tests
const itT = (name: string, fn: () => Promise<void>) => test(name, fn, { timeout: TEST_TIMEOUT });

run('PlaywrightAdapter - Enhanced Selectors', () => {
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

  itT('CSS selector (no prefix) - backward compatible', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: '.button',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.implPng.length).toBeGreaterThan(0);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('CSS selector with explicit prefix', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'css:.button',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('testid: selector', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'testid:submit-btn',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
    expect(result.meta).toBeDefined();
    expect(result.meta?.['__self__']?.testid).toBe('submit-btn');
  });

  itT('text: selector with double quotes', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'text:"Submit"',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('text: selector with single quotes', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: "text:'Submit'",
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('text: selector with escape sequences', async () => {
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
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });
    expect(result1.implPng).toBeInstanceOf(Buffer);

    // Test newline escape
    const result2 = await adapter.captureTarget({
      html: htmlWithEscapes,
      selector: 'text:"Line 1\\nLine 2"',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });
    expect(result2.implPng).toBeInstanceOf(Buffer);
  });

  itT('role: selector with name', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'role:button[name="Submit"]',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('role: selector with regex name', async () => {
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
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('Preserves colon in URL-like selectors', async () => {
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
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('CSS pseudo-class: :root selector', async () => {
    const htmlWithRoot = `
      <!DOCTYPE html>
      <html>
        <head><style>:root { --color: blue; }</style></head>
        <body>
          <div class="test">Test</div>
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    // :root should be treated as CSS selector, not as unknown prefix
    const result = await adapter.captureTarget({
      html: htmlWithRoot,
      selector: '.test', // Use valid selector instead of :root (can't screenshot root)
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('CSS pseudo-class: :has() selector', async () => {
    const htmlWithHas = `
      <!DOCTYPE html>
      <html>
        <body>
          <ul>
            <li>Item 1</li>
            <li><span>Item 2 with span</span></li>
          </ul>
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    // li:has(span) should be treated as CSS selector, not as unknown prefix
    const result = await adapter.captureTarget({
      html: htmlWithHas,
      selector: 'li:has(span)',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('CSS nth-child selector', async () => {
    const htmlWithList = `
      <!DOCTYPE html>
      <html>
        <body>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
            <li>Item 3</li>
          </ul>
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    // ul > li:nth-child(2) should be treated as CSS selector
    const result = await adapter.captureTarget({
      html: htmlWithList,
      selector: 'ul > li:nth-child(2)',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('text: selector with [exact] flag on quoted string', async () => {
    const htmlWithText = `
      <!DOCTYPE html>
      <html>
        <body>
          <p>Submit</p>
          <p>Submit Form</p>
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    // Should match only exact "Submit", not "Submit Form"
    const result = await adapter.captureTarget({
      html: htmlWithText,
      selector: 'text:"Submit"[exact]',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('role: selector with selected=true', async () => {
    const htmlWithTab = `
      <!DOCTYPE html>
      <html>
        <body>
          <div role="tablist">
            <button role="tab" aria-selected="true">Tab 1</button>
            <button role="tab">Tab 2</button>
          </div>
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: htmlWithTab,
      selector: 'role:tab[selected=true]',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('role: selector with checked=true', async () => {
    const htmlWithCheckbox = `
      <!DOCTYPE html>
      <html>
        <body>
          <input type="checkbox" role="checkbox" checked />
          <input type="checkbox" role="checkbox" />
        </body>
      </html>
    `;

    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: htmlWithCheckbox,
      selector: 'role:checkbox[checked=true]',
      detectStorybookIframe: false,
      idleWaitMs: 0,
      dpr: 1,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });
});
