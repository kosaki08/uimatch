import { chromium, type Browser } from 'playwright';

/**
 * Configuration options for capturing a web page element.
 * Either `url` or `html` must be provided.
 */
export interface CaptureOptions {
  /**
   * URL to navigate to (mutually exclusive with `html`).
   */
  url?: string;

  /**
   * HTML content to render (mutually exclusive with `url`).
   */
  html?: string;

  /**
   * CSS selector to locate the target element.
   */
  selector: string;

  /**
   * Viewport dimensions.
   * @default { width: 1440, height: 900 }
   */
  viewport?: { width: number; height: number };

  /**
   * Device pixel ratio.
   * @default 2
   */
  dpr?: number;

  /**
   * Font URLs to preload before capture.
   */
  fontPreloads?: string[];

  /**
   * HTTP Basic Authentication credentials.
   */
  basicAuth?: { username: string; password: string };

  /**
   * Auto-detect and use Storybook iframe (`/iframe.html`).
   * @default true
   */
  detectStorybookIframe?: boolean;

  /**
   * Maximum child elements to collect styles from.
   * @default 24
   */
  maxChildren?: number;

  /**
   * Additional idle wait after networkidle (ms).
   * @default 150
   */
  idleWaitMs?: number;
}

/**
 * Result of capturing a web page element.
 */
export interface CaptureResult {
  /**
   * Screenshot as PNG buffer.
   */
  implPng: Buffer;

  /**
   * Computed CSS styles keyed by selector.
   * Keys: `__self__`, `[data-testid="..."]`, or `:nth-child(n)`.
   */
  styles: Record<string, Record<string, string>>;

  /**
   * Bounding box of the captured element.
   */
  box: { x: number; y: number; width: number; height: number };
}

/**
 * Default CSS properties to extract from captured elements.
 * Includes typography, colors, layout, borders, and spacing.
 */
const DEFAULT_PROPS = [
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
  'justify-content',
  'align-items',
  'gap',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
] as const;

/**
 * Captures a screenshot and computed styles of a web page element.
 *
 * @param opts - Configuration options
 * @returns Screenshot, styles, and bounding box
 * @throws If `url` or `html` is missing, or element not found
 *
 * @example
 * ```typescript
 * const result = await captureTarget({
 *   url: 'https://example.com',
 *   selector: '#button',
 * });
 * ```
 */
export async function captureTarget(opts: CaptureOptions): Promise<CaptureResult> {
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
      await page.setContent(opts.html!, { waitUntil: 'load', timeout: 15_000 });
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
        for (let i = 0; i < urls.length; i++) {
          const u = urls[i]!;
          const l = document.createElement('link');
          l.rel = 'preload';
          l.as = 'font';
          l.crossOrigin = 'anonymous';
          l.href = u;
          document.head.appendChild(l);
        }
        return document.fonts?.ready ?? Promise.resolve();
      }, opts.fontPreloads);
    }

    // Additional idle wait to reduce non-deterministic rendering
    const idleWaitMs = opts.idleWaitMs ?? 150;
    await frame.evaluate((ms) => {
      return new Promise<void>((res) => {
        const ric = window.requestIdleCallback;
        if (ric) {
          ric(() => setTimeout(res, ms), { timeout: ms + 50 });
        } else {
          setTimeout(res, ms);
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

        const toRec = (el: Element) => {
          const st = getComputedStyle(el);
          const out: Record<string, string> = {};
          for (let i = 0; i < props.length; i++) {
            const p = props[i]!;
            out[p] = st.getPropertyValue(p) || '';
          }
          return out;
        };

        const base = root as Element;
        const result: Record<string, Record<string, string>> = {};
        result['__self__'] = toRec(base);

        const tests = Array.from(base.querySelectorAll('[data-testid]'));
        const chosen = (tests.length ? tests : Array.from(base.querySelectorAll('*'))).slice(
          0,
          max
        );

        for (let i = 0; i < chosen.length; i++) {
          const el = chosen[i]!;
          const key = (el as HTMLElement).dataset?.testid
            ? `[data-testid="${(el as HTMLElement).dataset?.testid}"]`
            : `:nth-child(${i + 1})`;
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
    throw e;
  }
}
