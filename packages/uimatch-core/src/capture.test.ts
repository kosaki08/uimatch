import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureTarget } from './capture.ts';
import { compareImages } from './core/compare.ts';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');
const redBase64 = () => readFileSync(join(FIXTURES_DIR, 'red-100x100.png')).toString('base64');

describe('captureTarget', () => {
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
    });
    const res = compareImages({
      figmaPngB64: redBase64(),
      implPngB64: cap.implPng.toString('base64'),
      pixelmatch: { threshold: 0.1, includeAA: true },
    });
    expect(res.pixelDiffRatio).toBe(0);
    expect(res.diffPixelCount).toBe(0);
  });

  test('capture collects computed styles', async () => {
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
    });

    expect(cap.styles['__self__']).toBeDefined();
    const self = cap.styles['__self__']!;
    expect(self['font-size']).toBe('16px');
    expect(self['color']).toBe('rgb(255, 0, 0)');
    expect(self['padding-top']).toBe('10px');

    expect(cap.styles['[data-testid="child1"]']).toBeDefined();
    const child1 = cap.styles['[data-testid="child1"]']!;
    expect(child1['font-weight']).toBe('700');
  });
});
