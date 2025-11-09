import { afterAll, describe, expect, test } from 'bun:test';
import { browserPool } from './browser-pool';
import { captureTarget } from './playwright';

const itT = (name: string, fn: () => Promise<void>) => test(name, fn, { timeout: 15000 });

// Gate E2E tests behind environment variable to prevent heavy browser tests during unit test runs
const ENABLE_E2E = process.env.UIMATCH_ENABLE_BROWSER_TESTS === 'true';
const run = ENABLE_E2E ? describe : describe.skip;

run('PlaywrightAdapter - Selector Strict Mode (isolated)', () => {
  itT('UIMATCH_SELECTOR_STRICT=true throws on unknown prefix', async () => {
    const orig = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';
    try {
      let err: Error | undefined;
      try {
        await captureTarget({
          html: '<div>Test</div>',
          selector: 'foo:bar',
          idleWaitMs: 0,
        });
      } catch (e) {
        err = e as Error;
      }
      expect(err).toBeDefined();
      expect(err?.message).toContain('Unknown selector prefix');
    } finally {
      if (orig === undefined) {
        delete process.env.UIMATCH_SELECTOR_STRICT;
      } else {
        process.env.UIMATCH_SELECTOR_STRICT = orig;
      }
    }
  });

  itT('UIMATCH_SELECTOR_STRICT=true allows CSS pseudo-classes like li:nth-child(1)', async () => {
    const orig = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';
    try {
      const res = await captureTarget({
        html: '<ul><li>First</li><li>Second</li></ul>',
        selector: 'li:nth-child(1)',
        detectStorybookIframe: false,
        dpr: 1,
        idleWaitMs: 0,
      });
      expect(res.implPng).toBeInstanceOf(Buffer);
    } finally {
      if (orig === undefined) {
        delete process.env.UIMATCH_SELECTOR_STRICT;
      } else {
        process.env.UIMATCH_SELECTOR_STRICT = orig;
      }
    }
  });

  itT('UIMATCH_SELECTOR_STRICT=true allows URL attribute selectors', async () => {
    const orig = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';
    try {
      const res = await captureTarget({
        html: `<!DOCTYPE html>
        <html>
          <body>
            <a href="https://example.com" style="display: block; padding: 10px;">Link</a>
          </body>
        </html>`,
        selector: 'a[href*="https:"]',
        detectStorybookIframe: false,
        dpr: 1,
        idleWaitMs: 0,
      });
      expect(res.implPng).toBeInstanceOf(Buffer);
    } finally {
      if (orig === undefined) {
        delete process.env.UIMATCH_SELECTOR_STRICT;
      } else {
        process.env.UIMATCH_SELECTOR_STRICT = orig;
      }
    }
  });

  itT('UIMATCH_SELECTOR_STRICT=true allows :root pseudo-class', async () => {
    const orig = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';
    try {
      const res = await captureTarget({
        html: `<!DOCTYPE html>
        <html style="margin: 0; padding: 0;">
          <body style="margin: 0; padding: 10px;">
            <div>Content</div>
          </body>
        </html>`,
        selector: ':root',
        detectStorybookIframe: false,
        dpr: 1,
        idleWaitMs: 0,
      });
      expect(res.implPng).toBeInstanceOf(Buffer);
    } finally {
      if (orig === undefined) {
        delete process.env.UIMATCH_SELECTOR_STRICT;
      } else {
        process.env.UIMATCH_SELECTOR_STRICT = orig;
      }
    }
  });

  itT('UIMATCH_SELECTOR_STRICT=true allows :has() pseudo-class', async () => {
    const orig = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';
    try {
      const res = await captureTarget({
        html: `<!DOCTYPE html>
        <html>
          <body>
            <div class="container" style="padding: 10px;">
              <span>Test</span>
            </div>
          </body>
        </html>`,
        selector: 'div:has(span)',
        detectStorybookIframe: false,
        dpr: 1,
        idleWaitMs: 0,
      });
      expect(res.implPng).toBeInstanceOf(Buffer);
    } finally {
      if (orig === undefined) {
        delete process.env.UIMATCH_SELECTOR_STRICT;
      } else {
        process.env.UIMATCH_SELECTOR_STRICT = orig;
      }
    }
  });

  // Cleanup: Close all browser instances to prevent process leakage
  afterAll(async () => {
    try {
      await browserPool.closeAll();
    } catch {
      // Ignore cleanup errors
    }
  });
});
