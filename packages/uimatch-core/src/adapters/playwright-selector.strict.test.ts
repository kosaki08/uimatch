import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { browserPool } from './browser-pool';
import { captureTarget } from './playwright';

const itT = (name: string, fn: () => Promise<void>) => test(name, fn, { timeout: 15000 });

beforeAll(async () => {
  process.env.UIMATCH_HEADLESS = 'true';
  await browserPool.getBrowser();
});

afterAll(async () => {
  await browserPool.closeAll();
});

describe('PlaywrightAdapter - Selector Strict Mode (isolated)', () => {
  itT('UIMATCH_SELECTOR_STRICT=true throws on unknown prefix', async () => {
    const orig = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';
    try {
      let err: Error | undefined;
      try {
        await captureTarget({ html: '<div>Test</div>', selector: 'foo:bar' });
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

  itT('UIMATCH_SELECTOR_STRICT=true rejects li:nth-child(1)-style word prefix', async () => {
    const orig = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';
    try {
      let err: Error | undefined;
      try {
        await captureTarget({ html: '<ul><li>a</li></ul>', selector: 'li:nth-child(1)' });
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

  itT('UIMATCH_SELECTOR_STRICT=true allows URL attribute selectors', async () => {
    const orig = process.env.UIMATCH_SELECTOR_STRICT;
    process.env.UIMATCH_SELECTOR_STRICT = 'true';
    try {
      const res = await captureTarget({
        html: '<a href="https://example.com">Link</a>',
        selector: 'a[href*="https:"]',
        detectStorybookIframe: false,
        dpr: 1,
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
});
