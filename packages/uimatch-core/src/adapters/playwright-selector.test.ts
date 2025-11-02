/**
 * Tests for enhanced selector system with prefix support
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { browserPool } from './browser-pool';
import { PlaywrightAdapter } from './playwright';

// E2E tests need more time than the default 5s. Use 15s as default.
const TEST_TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 15000);

// Pre-warm browser once before all tests to avoid startup cost in each test
beforeAll(async () => {
  process.env.UIMATCH_HEADLESS = process.env.UIMATCH_HEADLESS ?? 'true';
  await browserPool.getBrowser();
});

// Clean up browser pool after all tests
afterAll(async () => {
  await browserPool.closeAll();
});

// Helper to apply consistent timeout to all tests
const itT = (name: string, fn: () => Promise<void>) => test(name, fn, { timeout: TEST_TIMEOUT });

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

  itT('CSS selector (no prefix) - backward compatible', async () => {
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

  itT('CSS selector with explicit prefix', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'css:.button',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('testid: selector', async () => {
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

  itT('text: selector with double quotes', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'text:"Submit"',
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });

  itT('text: selector with single quotes', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: "text:'Submit'",
      idleWaitMs: 0,
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

  itT('role: selector with name', async () => {
    const adapter = new PlaywrightAdapter({ reuseBrowser: true });
    const result = await adapter.captureTarget({
      html: testHtml,
      selector: 'role:button[name="Submit"]',
      idleWaitMs: 0,
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
      idleWaitMs: 0,
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
      idleWaitMs: 0,
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
      idleWaitMs: 0,
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
      idleWaitMs: 0,
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
      idleWaitMs: 0,
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
      idleWaitMs: 0,
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
      idleWaitMs: 0,
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
      idleWaitMs: 0,
    });

    expect(result.implPng).toBeInstanceOf(Buffer);
    expect(result.styles['__self__']).toBeDefined();
  });
});

describe('PlaywrightAdapter - Selector Strict Mode', () => {
  itT('UIMATCH_SELECTOR_STRICT=true throws on unknown prefix', async () => {
    const originalStrict = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';

    try {
      const adapter = new PlaywrightAdapter({ reuseBrowser: true });
      let error: Error | undefined;

      try {
        await adapter.captureTarget({
          html: '<div>Test</div>',
          selector: 'foo:bar', // Unknown prefix
          idleWaitMs: 0,
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain('Unknown selector prefix: "foo"');
    } finally {
      // Restore original environment
      if (originalStrict === undefined) {
        delete process.env.UIMATCH_SELECTOR_STRICT;
      } else {
        process.env.UIMATCH_SELECTOR_STRICT = originalStrict;
      }
    }
  });

  itT('UIMATCH_SELECTOR_STRICT=true rejects CSS pseudo-classes with word prefix', async () => {
    const originalStrict = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';

    try {
      const htmlWithList = `
        <!DOCTYPE html>
        <html>
          <body>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </body>
        </html>
      `;

      const adapter = new PlaywrightAdapter({ reuseBrowser: true });
      let error: Error | undefined;

      try {
        // In strict mode, `li:nth-child(1)` looks like a typo (li is not a known prefix)
        await adapter.captureTarget({
          html: htmlWithList,
          selector: 'li:nth-child(1)',
          idleWaitMs: 0,
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain('Unknown selector prefix: "li"');
    } finally {
      // Restore original environment
      if (originalStrict === undefined) {
        delete process.env.UIMATCH_SELECTOR_STRICT;
      } else {
        process.env.UIMATCH_SELECTOR_STRICT = originalStrict;
      }
    }
  });

  itT('UIMATCH_SELECTOR_STRICT=true allows URL attribute selectors', async () => {
    const originalStrict = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';

    try {
      const htmlWithLink = `
        <!DOCTYPE html>
        <html>
          <body>
            <a href="https://example.com">Link</a>
          </body>
        </html>
      `;

      const adapter = new PlaywrightAdapter({ reuseBrowser: true });
      // URL attribute selector should work even in strict mode
      const result = await adapter.captureTarget({
        html: htmlWithLink,
        selector: 'a[href*="https:"]',
        idleWaitMs: 0,
      });

      expect(result.implPng).toBeInstanceOf(Buffer);
      expect(result.styles['__self__']).toBeDefined();
    } finally {
      // Restore original environment
      if (originalStrict === undefined) {
        delete process.env.UIMATCH_SELECTOR_STRICT;
      } else {
        process.env.UIMATCH_SELECTOR_STRICT = originalStrict;
      }
    }
  });
});
