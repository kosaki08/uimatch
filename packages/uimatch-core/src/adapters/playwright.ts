/**
 * Playwright adapter for browser automation
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { BrowserAdapter, CaptureOptions, CaptureResult } from '../types/adapters';
import { browserPool } from './browser-pool';

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
  'letter-spacing',
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
  // Text & formatting
  'text-align',
  'text-transform',
  'text-decoration-line',
  'white-space',
  'word-break',
  // Sizing constraints
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'box-sizing',
  // Overflow
  'overflow-x',
  'overflow-y',
  // Flex extras
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  // Visual
  'opacity',
] as const;

/**
 * Playwright implementation of BrowserAdapter.
 * Uses Chromium to capture screenshots and extract computed styles.
 *
 * Supports browser reuse via browser pool for improved performance.
 */
export class PlaywrightAdapter implements BrowserAdapter {
  /**
   * Whether to reuse browser instances
   * @default false
   */
  private reuseBrowser: boolean;

  constructor(options?: { reuseBrowser?: boolean }) {
    this.reuseBrowser = options?.reuseBrowser ?? false;
  }
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

    let browser: Browser;
    let context: BrowserContext;
    let shouldCloseBrowser = true;

    const effectiveReuse = opts.reuseBrowser ?? this.reuseBrowser;
    if (effectiveReuse) {
      browser = await browserPool.getBrowser();
      shouldCloseBrowser = false;
      context = await browserPool.createContext({
        viewport: opts.viewport ?? { width: 1440, height: 900 },
        deviceScaleFactor: opts.dpr ?? 2,
        httpCredentials: opts.basicAuth,
      });
    } else {
      const headless = process.env.UIMATCH_HEADLESS !== 'false';
      const channel = process.env.UIMATCH_CHROME_CHANNEL as 'chrome' | 'msedge' | undefined;
      const args = process.env.UIMATCH_CHROME_ARGS?.split(/\s+/).filter(Boolean) ?? [];
      browser = await chromium.launch({ headless, channel, args });
      context = await browser.newContext({
        viewport: opts.viewport ?? { width: 1440, height: 900 },
        deviceScaleFactor: opts.dpr ?? 2,
        httpCredentials: opts.basicAuth,
      });
    }

    const page = await context.newPage();
    try {
      if (opts.url) {
        const timeout = Number(process.env.UIMATCH_HTTP_TIMEOUT_MS) || 30_000;
        const waitUntil =
          (process.env.UIMATCH_WAIT_UNTIL as 'load' | 'networkidle' | 'domcontentloaded') || 'load';
        await page.goto(opts.url, { waitUntil, timeout });
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

      try {
        await locator.waitFor({ state: 'visible', timeout: 10_000 });
      } catch {
        // Provide actionable error message with suggestions
        const testIdElements = await frame.locator('[data-testid]').count();
        const suggestions: string[] = [
          `Selector "${opts.selector}" not found or not visible.`,
          '',
          'Suggestions:',
        ];

        if (testIdElements > 0) {
          suggestions.push('- Try using a [data-testid] selector');
        }

        if (opts.detectStorybookIframe !== false) {
          suggestions.push('- If not using Storybook, try setting detectStorybookIframe: false');
        }

        suggestions.push('- Verify the element is rendered and visible');
        suggestions.push('- Check if the element requires user interaction to appear');

        throw new Error(suggestions.join('\n'));
      }

      await locator.evaluate((el) =>
        (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' })
      );

      const box = await locator.boundingBox();
      if (!box) {
        throw new Error(
          `captureTarget: boundingBox not available for selector="${opts.selector}"\n\n` +
            'This may happen if the element has zero width/height or is not laid out.\n' +
            'Verify the element has visible dimensions in the browser.'
        );
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

      if (effectiveReuse) {
        await browserPool.closeContext(context);
      } else {
        await context.close();
        if (shouldCloseBrowser) {
          await browser.close();
        }
      }
      return { implPng: Buffer.from(implPng), styles, box };
    } catch (e) {
      // Safe cleanup: check existence and wrap in try-catch to prevent secondary exceptions
      try {
        if (effectiveReuse) {
          if (context) await browserPool.closeContext(context);
        } else {
          if (context) await context.close();
          if (shouldCloseBrowser && browser) await browser.close();
        }
      } catch {
        // Suppress secondary exceptions during cleanup
      }
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
  const adapter = new PlaywrightAdapter({ reuseBrowser: opts.reuseBrowser });
  return adapter.captureTarget(opts);
}
