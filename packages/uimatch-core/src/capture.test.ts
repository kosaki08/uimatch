import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserPool } from './adapters/browser-pool';
import { captureTarget } from './adapters/playwright';
import { compareImages } from './core/compare';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');
const redBase64 = () => readFileSync(join(FIXTURES_DIR, 'red-100x100.png')).toString('base64');

// Browser tests always enabled in test:all

const run = describe;

run('captureTarget', () => {
  // E2E stabilization: reduce startup cost and shorten timeouts
  beforeAll(async () => {
    process.env.UIMATCH_HEADLESS = process.env.UIMATCH_HEADLESS ?? 'true';
    process.env.UIMATCH_SELECTOR_FIRST = process.env.UIMATCH_SELECTOR_FIRST ?? 'true';
    process.env.UIMATCH_SET_CONTENT_TIMEOUT_MS =
      process.env.UIMATCH_SET_CONTENT_TIMEOUT_MS ?? '1200';
    process.env.UIMATCH_NAV_TIMEOUT_MS = process.env.UIMATCH_NAV_TIMEOUT_MS ?? '1500';
    process.env.UIMATCH_SELECTOR_WAIT_MS = process.env.UIMATCH_SELECTOR_WAIT_MS ?? '2500';
    process.env.UIMATCH_BBOX_TIMEOUT_MS = process.env.UIMATCH_BBOX_TIMEOUT_MS ?? '800';
    process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS = process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS ?? '1000';
    await browserPool.getBrowser();
  });

  afterAll(async () => {
    await browserPool.closeAll();
  });
  test('html mode: 100x100 red box equals fixture', async () => {
    const html = `
      <html><head><style>
        #box { width:100px;height:100px;background:#ff0000; }
        *{margin:0;padding:0}
      </style></head>
      <body><div id="box" data-testid="box"></div></body></html>`;
    const cap = await captureTarget({
      html,
      selector: '#box',
      viewport: { width: 200, height: 200 },
      dpr: 1,
      detectStorybookIframe: false,
      reuseBrowser: true,
    });
    const res = compareImages({
      figmaPngB64: redBase64(),
      implPngB64: cap.implPng.toString('base64'),
      pixelmatch: { threshold: 0.1, includeAA: true },
    });
    expect(res.pixelDiffRatio).toBe(0);
    expect(res.diffPixelCount).toBe(0);
  });

  test(
    'capture collects computed styles',
    async () => {
      const html = `
      <html><head><style>
        #container { font-size: 16px; color: rgb(255, 0, 0); padding: 10px; }
        .child { font-weight: bold; }
      </style></head>
      <body>
        <div id="container" data-testid="container">
          <span class="child" data-testid="child1">Test</span>
        </div>
      </body></html>`;
      const cap = await captureTarget({
        html,
        selector: '#container',
        viewport: { width: 300, height: 200 },
        dpr: 1,
        detectStorybookIframe: false,
        reuseBrowser: true,
        idleWaitMs: 0, // Skip idle wait for deterministic data: URL tests
        maxChildren: 50, // Limit style collection for faster execution
      });

      expect(cap.styles['__self__']).toBeDefined();
      const self = cap.styles['__self__'];
      if (!self) throw new Error('Expected __self__ to be defined');
      expect(self['font-size']).toBe('16px');
      expect(self['color']).toBe('rgb(255, 0, 0)');
      expect(self['padding-top']).toBe('10px');

      const childKey = '__self__ > :nth-child(1)';
      expect(cap.styles[childKey]).toBeDefined();
      const child1 = cap.styles[childKey];
      if (!child1) throw new Error('Expected child1 to be defined');
      expect(child1['font-weight']).toBe('700');
    },
    { timeout: 15000 }
  );
});
