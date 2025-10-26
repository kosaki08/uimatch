/**
 * Playwright adapter for browser automation
 */

import { chromium, type Browser } from 'playwright';
import type { BrowserAdapter, CaptureOptions, CaptureResult } from '../types/adapters';

/**
 * Default CSS properties to extract from captured elements.
 * Includes typography, colors, layout (flex/grid), borders, spacing, and dimensions.
 */
const DEFAULT_PROPS = [
  'width',
  'height',
  'font-size',
  'line-height',
  'font-weight',
  'font-family',
  'color',
  'background-color',
  'border-radius',
  'border-color',
  'border-width',
  'box-shadow',
  'display',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-content',
  'gap',
  'column-gap',
  'row-gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'place-items',
  'place-content',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
] as const;

/**
 * Playwright implementation of BrowserAdapter.
 * Uses Chromium to capture screenshots and extract computed styles.
 */
export class PlaywrightAdapter implements BrowserAdapter {
  /**
   * Captures a screenshot and computed styles of a web page element.
   *
   * @param opts - Configuration options
   * @returns Screenshot, styles, and bounding box
   * @throws If `url` or `html` is missing, or element not found
   *
   * @example
   * ```typescript
   * const adapter = new PlaywrightAdapter();
   * const result = await adapter.captureTarget({
   *   url: 'https://example.com',
   *   selector: '#button',
   * });
   * ```
   */
  async captureTarget(opts: CaptureOptions): Promise<CaptureResult> {
    if (!opts.url && !opts.html) throw new Error('captureTarget: url or html is required');
    const browser: Browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: opts.viewport ?? { width: 1440, height: 900 },
      deviceScaleFactor: opts.dpr ?? 2,
      httpCredentials: opts.basicAuth,
    });
    const page = await context.newPage();
    try {
      if (opts.url) {
        await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 30_000 });
      } else {
        if (!opts.html) {
          throw new Error('Either url or html must be provided');
        }
        await page.setContent(opts.html, { waitUntil: 'load', timeout: 15_000 });
      }

      // Detect Storybook iframe (/iframe.html takes precedence)
      let frame = page.mainFrame();
      if (opts.detectStorybookIframe ?? true) {
        const sb = page.frames().find((f) => /\/iframe\.html/.test(f.url()));
        if (sb) frame = sb;
      }

      // Disable animations, enforce white background, and preload fonts
      await frame.addStyleTag({
        content: `*{animation:none!important;transition:none!important}body{background:#fff!important}`,
      });
      if (opts.fontPreloads?.length) {
        await frame.evaluate((urls: string[]) => {
          const doc = globalThis.document;
          for (let i = 0; i < urls.length; i++) {
            const u = urls[i];
            if (!u) continue;
            const link = doc.createElement('link');
            link.rel = 'preload';
            link.as = 'font';
            link.crossOrigin = 'anonymous';
            link.href = u;
            doc.head.appendChild(link);
          }
          return doc.fonts?.ready ?? Promise.resolve();
        }, opts.fontPreloads);
      }

      // Additional idle wait to reduce non-deterministic rendering
      const idleWaitMs = opts.idleWaitMs ?? 150;
      await frame.evaluate((ms: number) => {
        return new Promise<void>((resolve) => {
          const ric = globalThis.requestIdleCallback;
          if (ric) {
            ric(() => setTimeout(resolve, ms), { timeout: ms + 50 });
          } else {
            setTimeout(resolve, ms);
          }
        });
      }, idleWaitMs);

      const locator = frame.locator(opts.selector);
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      await locator.evaluate((el) =>
        (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' })
      );

      const box = await locator.boundingBox();
      if (!box) {
        throw new Error(`captureTarget: boundingBox not available for selector=${opts.selector}`);
      }

      const implPng = await locator.screenshot({ type: 'png' });

      // Extract computed styles from the element and its children
      type StyleEvalArg = { max: number; props: string[] };
      type StyleEvalRet = Record<string, Record<string, string>>;

      const styles = await locator.evaluate<StyleEvalRet, StyleEvalArg>(
        (root, arg) => {
          const { max, props } = arg;

          const toRec = (el: Element): Record<string, string> => {
            const st = globalThis.getComputedStyle(el);
            const out: Record<string, string> = {};
            for (let i = 0; i < props.length; i++) {
              const p = props[i];
              if (!p) continue;
              out[p] = st.getPropertyValue(p) || '';
            }
            return out;
          };

          const base = root as Element;
          const result: Record<string, Record<string, string>> = {};
          result['__self__'] = toRec(base);

          const testsNodeList = base.querySelectorAll('[data-testid]');
          const tests = Array.from(testsNodeList);
          const allChildren = Array.from(base.querySelectorAll('*'));
          const chosen = (tests.length > 0 ? tests : allChildren).slice(0, max);

          for (let i = 0; i < chosen.length; i++) {
            const el = chosen[i];
            if (!el) continue;
            const htmlEl = el as HTMLElement;
            const testid = htmlEl.dataset?.testid;
            const key = testid ? `[data-testid="${testid}"]` : `:nth-child(${i + 1})`;
            result[key] = toRec(el);
          }
          return result;
        },
        { max: opts.maxChildren ?? 24, props: Array.from(DEFAULT_PROPS) as string[] }
      );

      await browser.close();
      return { implPng: Buffer.from(implPng), styles, box };
    } catch (e) {
      await browser.close();
      throw e as Error;
    }
  }
}

/**
 * Convenience function for capturing using Playwright adapter.
 * @param opts - Capture configuration
 * @returns Screenshot, styles, and bounding box
 */
export async function captureTarget(opts: CaptureOptions): Promise<CaptureResult> {
  const adapter = new PlaywrightAdapter();
  return adapter.captureTarget(opts);
}
