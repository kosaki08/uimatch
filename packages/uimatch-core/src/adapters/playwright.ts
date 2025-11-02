/**
 * Playwright adapter for browser automation
 */

import { chromium, type Browser, type BrowserContext, type Frame, type Locator } from 'playwright';
import { DEFAULT_CONFIG } from '../config/defaults';
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
  // Side-specific border properties
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
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
  'text-decoration-thickness',
  'text-underline-offset',
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
  // Position (for layout category)
  'position',
  'top',
  'right',
  'bottom',
  'left',
] as const;

const EXTENDED_PROPS = [
  ...DEFAULT_PROPS,
  'z-index',
  'align-self',
  'place-self',
  'outline-width',
  'outline-style',
  'outline-color',
  'outline-offset',
  'filter',
  'backdrop-filter',
  'text-wrap',
] as const;

/**
 * Resolves a selector string with optional prefix to a Playwright Locator.
 *
 * Supported prefixes:
 * - `role:button[name="View docs"]` → getByRole('button', { name: 'View docs' })
 * - `role:button[name=/docs/i][exact]` → getByRole with regex name and exact option
 * - `role:heading[level=1]` → getByRole('heading', { level: 1 })
 * - `role:button[pressed=true|selected=true|checked=true]` → Boolean state options
 * - `testid:accordion-item` → getByTestId('accordion-item')
 * - `text:"Continue"` or `text:'Continue'` → getByText('Continue', { exact: true })
 * - `text:"Continue"[exact]` or `text:/Continue/i[exact]` → Explicit exact match
 * - `text:/Continue/i` → getByText(/Continue/i)
 * - `xpath://div[@class="header"]` → locator('xpath=//div[@class="header"]')
 * - `css:.bg-white` → locator('.bg-white')
 * - `dompath:__self__ > :nth-child(2)` → locator for child element (use after initial capture)
 * - No prefix → assumes CSS selector (backward compatible)
 * - CSS pseudo-classes (`:root`, `:has()`, etc.) → treated as CSS selectors
 *
 * Unknown prefixes:
 * - With UIMATCH_SELECTOR_STRICT=true → throws error (strict mode for CI)
 * - Otherwise → fallback to CSS selector (lenient mode for interactive use)
 *
 * @param frame - Target frame
 * @param selectorString - Selector with optional prefix
 * @returns Playwright Locator
 * @throws Error when prefix is unknown and UIMATCH_SELECTOR_STRICT=true
 */
export function resolveLocator(frame: Frame, selectorString: string): Locator {
  // DEBUG logging for troubleshooting
  const DEBUG = process.env.DEBUG?.includes('uimatch:selector');
  if (DEBUG) {
    console.debug('[uimatch:selector] input:', selectorString);
  }

  // Only match known prefixes to avoid false positives with CSS selectors
  // Known prefixes: role, testid, text, xpath, css, dompath
  // This regex explicitly matches ONLY known prefixes, so:
  // - `role:button` → matches (known prefix)
  // - `li:nth-child(1)` → no match (li is not a known prefix) → treated as CSS
  // - `:root` → no match (starts with colon) → treated as CSS
  // - `a[href*="https:"]` → no match (doesn't start with known prefix) → treated as CSS
  const knownPrefixes = ['role', 'testid', 'text', 'xpath', 'css', 'dompath'];
  const prefixPattern = new RegExp(`^(${knownPrefixes.join('|')}):(.*)$`, 's');
  const m = selectorString.match(prefixPattern);

  if (!m) {
    // No known prefix detected → treat as CSS selector
    if (DEBUG) {
      console.debug('[uimatch:selector] no known prefix → CSS fallback');
    }

    // In strict mode, check if selector looks like it might have a typo
    // (has a colon with a word before it that's not a known prefix)
    if (process.env.UIMATCH_SELECTOR_STRICT === 'true') {
      const unknownPrefixCheck = selectorString.match(/^([a-z]\w+):(.*)$/i);
      if (unknownPrefixCheck) {
        const [, suspiciousPrefix] = unknownPrefixCheck;
        throw new Error(
          `Unknown selector prefix: "${suspiciousPrefix}"\n` +
            `Supported prefixes: ${knownPrefixes.join(', ')}\n` +
            `If this is a CSS selector (e.g., "li:nth-child(1)"), ` +
            `set UIMATCH_SELECTOR_STRICT=false to enable CSS fallback.`
        );
      }
    }

    return applyFirstIfNeeded(frame.locator(selectorString));
  }

  const prefix = m[1];
  const rest = m[2];

  // Type guard: ensure prefix and rest are defined
  if (!prefix || !rest) {
    throw new Error(`Invalid selector format: "${selectorString}"`);
  }

  switch (prefix) {
    case 'role': {
      // Parse role:button[name="View docs"][exact] or role:button[name=/.../i][level=1]
      // Basic format: role:button or role:button[name="text"]
      const roleMatch = /^([a-z]+)(.*)$/i.exec(rest);
      if (!roleMatch) {
        throw new Error(`Invalid role selector format: "${selectorString}"`);
      }
      const [, roleName, optionsStr] = roleMatch;
      if (!roleName) {
        throw new Error(`Invalid role selector format: "${selectorString}"`);
      }

      // Parse options from bracket notation
      const options: Parameters<typeof frame.getByRole>[1] = {};
      if (optionsStr) {
        // Extract [name="..."] or [name=/.../i]
        const nameMatch = /\[name=(?:"([^"]+)"|\/([^/]+)\/([a-z]*)|'([^']+)')\]/i.exec(optionsStr);
        if (nameMatch) {
          if (nameMatch[1] || nameMatch[4]) {
            // String name: [name="text"] or [name='text']
            options.name = nameMatch[1] || nameMatch[4];
          } else if (nameMatch[2]) {
            // Regex name: [name=/pattern/flags]
            options.name = new RegExp(nameMatch[2], nameMatch[3] || '');
          }
        }

        // Extract [exact]
        if (/\[exact\]/i.test(optionsStr)) {
          options.exact = true;
        }

        // Extract [level=N]
        const levelMatch = /\[level=(\d+)\]/i.exec(optionsStr);
        if (levelMatch) {
          options.level = Number(levelMatch[1]);
        }

        // Extract [pressed=true|false]
        const pressedMatch = /\[pressed=(true|false)\]/i.exec(optionsStr);
        if (pressedMatch) {
          options.pressed = pressedMatch[1] === 'true';
        }

        // Extract boolean options: [selected=true|false], [checked=true|false], etc.
        const booleanOptions = [
          'selected',
          'checked',
          'expanded',
          'disabled',
          'includeHidden',
        ] as const;
        for (const key of booleanOptions) {
          const pattern = new RegExp(`\\[${key}=(true|false)\\]`, 'i');
          const match = pattern.exec(optionsStr);
          if (match) {
            // Use type assertion to satisfy TypeScript
            (options as Record<string, unknown>)[key] = match[1] === 'true';
          }
        }
      }

      // Boolean options (selected, checked, etc.) can be slow with getByRole heuristics
      // Convert to CSS selector with both aria-* and native :checked/:disabled support
      const hasBoolean =
        optionsStr &&
        /\[(selected|checked|pressed|expanded|disabled)=(true|false)\]/i.test(optionsStr);
      const hasName = optionsStr && /\[name=/.test(optionsStr);

      // Only apply CSS fallback for boolean options when name is not specified
      // This prevents losing accessible name filtering accuracy
      if (hasBoolean && optionsStr && !hasName) {
        const getBool = (key: string): string | undefined => {
          const match = new RegExp(`\\[${key}=(true|false)\\]`, 'i').exec(optionsStr);
          return match?.[1];
        };

        const selected = getBool('selected');
        const pressed = getBool('pressed');
        const expanded = getBool('expanded');
        const disabled = getBool('disabled');
        const checked = getBool('checked');

        // Build base selector with boolean attributes (excluding checked which needs union)
        let base = `[role="${roleName}"]`;
        if (selected) base += `[aria-selected="${selected}"]`;
        if (pressed) base += `[aria-pressed="${pressed}"]`;
        if (expanded) base += `[aria-expanded="${expanded}"]`;
        if (disabled) base += `[aria-disabled="${disabled}"]`;

        let locator: Locator;
        if (checked) {
          // Support both aria-checked and native :checked pseudo-class
          // Use comma-separated union instead of :is() for better Playwright CSS compatibility
          if (roleName === 'checkbox' || roleName === 'radio') {
            const union =
              checked === 'true'
                ? `${base}[aria-checked="true"], ${base}:checked`
                : `${base}[aria-checked="false"], ${base}:not(:checked)`;
            locator = frame.locator(union);
          } else {
            locator = frame.locator(`${base}[aria-checked="${checked}"]`);
          }
        } else {
          locator = frame.locator(base);
        }

        if (DEBUG) {
          console.debug('[uimatch:selector] role (CSS fallback):', {
            roleName,
            selector: checked ? 'union' : base,
          });
        }
        return applyFirstIfNeeded(locator);
      }

      // No boolean options: use standard getByRole
      if (DEBUG) {
        console.debug('[uimatch:selector] role:', { roleName, options });
      }
      return applyFirstIfNeeded(
        frame.getByRole(roleName as Parameters<typeof frame.getByRole>[0], options)
      );
    }

    case 'testid': {
      if (DEBUG) {
        console.debug('[uimatch:selector] testid:', rest);
      }
      return applyFirstIfNeeded(frame.getByTestId(rest));
    }

    case 'text': {
      let s = rest.trim();

      // Check for [exact] flag and remove it from the string
      const exactFlag = /\[exact\]/i.test(s);
      s = s.replace(/\[exact\]/gi, '').trim();

      // Handle quoted strings with [exact] flag: use XPath for deterministic matching
      // This avoids getByText heuristics which can be slow in some environments
      if (
        exactFlag &&
        ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
      ) {
        let raw = s.slice(1, -1);
        // Handle escape sequences: \\ must be processed first to avoid double-processing
        raw = raw
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t');

        // XPath string literal helper (handles quotes in text)
        const xpathLiteral = (text: string): string => {
          if (!text.includes("'")) return `'${text}'`;
          if (!text.includes('"')) return `"${text}"`;
          // Mixed quotes: use concat()
          return `concat('${text.split("'").join(`',"'","'`)}')`;
        };

        if (DEBUG) {
          console.debug('[uimatch:selector] text (XPath exact):', { raw });
        }
        return frame.locator(`xpath=//*[normalize-space(.)=${xpathLiteral(raw)}]`);
      }

      // Handle quoted strings without [exact]: use getByText with exact:true
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        let raw = s.slice(1, -1);
        // Handle escape sequences: \\ must be processed first to avoid double-processing
        raw = raw
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t');
        if (DEBUG) {
          console.debug('[uimatch:selector] text (quoted):', { raw, exact: true });
        }
        // Quoted strings always use exact:true
        return applyFirstIfNeeded(frame.getByText(raw, { exact: true }));
      }

      // Handle regex: text:/Continue/i
      if (s.startsWith('/')) {
        const lastSlash = s.lastIndexOf('/');
        if (lastSlash > 0) {
          const pattern = s.slice(1, lastSlash);
          const flags = s.slice(lastSlash + 1);
          if (DEBUG) {
            console.debug('[uimatch:selector] text (regex):', {
              pattern,
              flags,
              exact: exactFlag || false,
            });
          }
          return applyFirstIfNeeded(
            frame.getByText(new RegExp(pattern, flags), { exact: exactFlag || false })
          );
        }
      }

      // Default: treat as plain text
      if (DEBUG) {
        console.debug('[uimatch:selector] text (plain):', { text: s, exact: exactFlag || false });
      }
      return applyFirstIfNeeded(frame.getByText(s, { exact: exactFlag || false }));
    }

    case 'xpath': {
      if (DEBUG) {
        console.debug('[uimatch:selector] xpath:', rest);
      }
      return applyFirstIfNeeded(frame.locator(`xpath=${rest}`));
    }

    case 'css': {
      if (DEBUG) {
        console.debug('[uimatch:selector] css:', rest);
      }
      return applyFirstIfNeeded(frame.locator(rest));
    }

    case 'dompath': {
      // Internal DOM path after capture (e.g., "__self__ > :nth-child(2)")
      if (DEBUG) {
        console.debug('[uimatch:selector] dompath:', rest);
      }
      // Don't apply first() for internal DOM paths - we want exact child selector
      return frame.locator(rest);
    }
  }

  // This should never be reached due to knownPrefixes check above
  throw new Error(`Unhandled selector prefix: "${prefix}"`);
}

/**
 * Applies `.first()` to the locator if UIMATCH_SELECTOR_FIRST=true.
 * Useful for handling multiple matching elements (e.g., getByRole, getByText).
 *
 * @param locator - Target locator
 * @returns Locator (optionally with `.first()`)
 */
function applyFirstIfNeeded(locator: Locator): Locator {
  const useFirst = process.env.UIMATCH_SELECTOR_FIRST === 'true';
  return useFirst ? locator.first() : locator;
}

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

    const isHtmlMode = Boolean(opts.html);

    // Strict mode: Fail fast on unknown selector prefix before any heavy operations
    if (process.env.UIMATCH_SELECTOR_STRICT === 'true') {
      const knownPrefixes = /^(role|testid|text|xpath|css|dompath):/i;
      const possiblePrefix = /^([a-z]\w+):(.*)$/i;
      if (!knownPrefixes.test(opts.selector) && possiblePrefix.test(opts.selector)) {
        const badPrefix = opts.selector.split(':', 1)[0];
        throw new Error(
          `Unknown selector prefix: "${badPrefix}"\nSupported: role, testid, text, xpath, css, dompath`
        );
      }
    }

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
      // Set shorter default timeouts to ensure page-level timeout < test timeout
      const selTimeout = Number(process.env.UIMATCH_SELECTOR_WAIT_MS ?? 6000);
      const visibleTimeout = isHtmlMode ? Math.min(selTimeout, 2500) : selTimeout;
      const bboxTimeout = Number(
        process.env.UIMATCH_BBOX_TIMEOUT_MS ?? (isHtmlMode ? 800 : selTimeout)
      );
      const shotTimeout = Number(
        process.env.UIMATCH_SCREENSHOT_TIMEOUT_MS ?? (isHtmlMode ? 1000 : selTimeout)
      );
      const navTimeout = Number(process.env.UIMATCH_NAV_TIMEOUT_MS ?? 6000);
      page.setDefaultTimeout(selTimeout);
      page.setDefaultNavigationTimeout(navTimeout);

      if (opts.url) {
        const timeout = Number(process.env.UIMATCH_HTTP_TIMEOUT_MS) || 30_000;
        const waitUntil =
          (process.env.UIMATCH_WAIT_UNTIL as 'load' | 'networkidle' | 'domcontentloaded') || 'load';
        await page.goto(opts.url, { waitUntil, timeout });
      } else {
        if (!opts.html) {
          throw new Error('Either url or html must be provided');
        }
        // HTML mode: no external resources, use shorter timeout with domcontentloaded
        const htmlTimeout = Number(process.env.UIMATCH_SET_CONTENT_TIMEOUT_MS ?? 2000);
        await page.setContent(opts.html, { waitUntil: 'domcontentloaded', timeout: htmlTimeout });
      }

      // Detect Storybook iframe (/iframe.html takes precedence)
      // HTMLモード時は Storybook iframe 検出を行わない
      let frame = page.mainFrame();
      if (!isHtmlMode && (opts.detectStorybookIframe ?? true)) {
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

      // Resolve locator with intelligent fallback for reliability
      const locator = await (async () => {
        // Primary: standard resolution
        let loc = resolveLocator(frame, opts.selector);

        // Quick probe to detect if element exists (avoid long timeout)
        // HTMLモードではクイックプローブをスキップ（そのまま visible 待機へ）
        const probeMs = Number(process.env.UIMATCH_PROBE_TIMEOUT_MS ?? 1200);
        if (!isHtmlMode && probeMs > 0) {
          try {
            await loc.first().waitFor({ state: 'attached', timeout: probeMs });
            return loc;
          } catch {
            // Fallback: Environment-specific optimizations for role/text selectors
            // This avoids getByRole/getByText heuristics which can be slow in headless mode

            // Fallback for role selectors with boolean attributes (selected, checked, etc.)
            const roleMatch = opts.selector.match(/^role:([a-z]+)(.*)$/i);
            if (roleMatch) {
              const roleName = roleMatch[1]?.toLowerCase();
              const optStr = roleMatch[2] || '';

              // Extract boolean attributes and convert to CSS selector
              const getBool = (key: string): string | undefined => {
                const match = new RegExp(`\\[${key}=(true|false)\\]`, 'i').exec(optStr);
                return match?.[1];
              };

              const css: string[] = [`[role="${roleName}"]`];
              const selected = getBool('selected');
              if (selected) css.push(`[aria-selected="${selected}"]`);
              const checked = getBool('checked');
              if (checked) css.push(`[aria-checked="${checked}"]`);
              const pressed = getBool('pressed');
              if (pressed) css.push(`[aria-pressed="${pressed}"]`);
              const expanded = getBool('expanded');
              if (expanded) css.push(`[aria-expanded="${expanded}"]`);
              const disabled = getBool('disabled');
              if (disabled) css.push(`[aria-disabled="${disabled}"]`);

              loc = frame.locator(css.join(''));
              return loc;
            }

            // Fallback for exact text match: use XPath for deterministic matching
            const textMatch = opts.selector.match(/^text:\s*["']([\s\S]*?)["'](\[exact\])?$/i);
            if (textMatch) {
              const rawText = textMatch[1]
                ?.replace(/\\\\/g, '\\')
                .replace(/\\"/g, '"')
                .replace(/\\'/g, "'")
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t');

              // XPath string literal helper (handles quotes in text)
              const xpathLiteral = (s: string): string => {
                if (!s.includes("'")) return `'${s}'`;
                if (!s.includes('"')) return `"${s}"`;
                return `concat('${s.split("'").join(`',"'","'`)}')`;
              };

              if (rawText !== undefined) {
                loc = frame.locator(`xpath=//*[normalize-space(.)=${xpathLiteral(rawText)}]`);
                return loc;
              }
            }

            // No fallback available, return original locator (will fail with timeout)
            return loc;
          }
        } else {
          // HTMLモード時はフォールバックなしで続行
        }

        // No probe or fallback used, return original locator
        return loc;
      })();

      // Use the same timeout value that was already defined above
      try {
        await locator.waitFor({ state: 'visible', timeout: visibleTimeout });
      } catch {
        // Error diagnostics are disabled in tests to prevent double timeout
        // (waitFor timeout + diagnostic operations > test timeout)
        throw new Error(`Selector "${opts.selector}" not found or not visible.`);
      }

      await locator.evaluate((el) =>
        (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' })
      );

      // Add explicit timeout to prevent hanging beyond test timeout
      const box = await locator.boundingBox({ timeout: bboxTimeout });
      if (!box) {
        throw new Error(
          `captureTarget: boundingBox not available for selector="${opts.selector}"\n\n` +
            'This may happen if the element has zero width/height or is not laid out.\n' +
            'Verify the element has visible dimensions in the browser.'
        );
      }

      // Add explicit timeout to screenshot as well
      const implPng = await locator.screenshot({ type: 'png', timeout: shotTimeout });

      // Capture child element bounding box if childSelector is provided (MVP: CSS/dompath only)
      let childBox: { x: number; y: number; width: number; height: number } | undefined;
      if (opts.childSelector) {
        const cs = opts.childSelector;
        const isCss = /^css:/i.test(cs) || /^[.#:\w[]/.test(cs) || /^>/.test(cs) || /^\[/.test(cs);
        const isDomPath = /^dompath:/i.test(cs);
        try {
          let childLoc: Locator | undefined;
          if (isDomPath) {
            // dompath: relative to root locator
            childLoc = locator.locator(cs.replace(/^dompath:/i, ''));
          } else if (isCss) {
            // CSS: relative scope
            const cleaned = cs.replace(/^css:/i, '');
            childLoc = locator.locator(`:scope ${cleaned.startsWith('>') ? '' : '>> '}${cleaned}`);
          }
          if (childLoc) {
            // Short timeout for child element (500ms) - if not found, continue without childBox
            await childLoc.first().waitFor({ state: 'visible', timeout: 500 });
            const cb = await childLoc.first().boundingBox({ timeout: 500 });
            if (cb) {
              childBox = { x: cb.x, y: cb.y, width: cb.width, height: cb.height };
            }
          }
        } catch {
          // Child not found or not visible - continue without childBox
        }
      }

      // Extract computed styles and DOM metadata from the element and its children
      type StyleEvalArg = {
        max: number;
        maxDepth: number;
        props: string[];
        propsMode: CaptureOptions['propsMode'];
      };
      type StyleEvalRet = {
        styles: Record<string, Record<string, string>>;
        meta: Record<
          string,
          {
            tag: string;
            id?: string;
            class?: string;
            testid?: string;
            cssSelector?: string;
            height?: number;
            role?: string;
            href?: string;
            type?: string;
            tabindex?: string;
            cursor?: string;
            elementKind?: 'interactive' | 'text' | 'container';
          }
        >;
      };

      const { styles, meta } = await locator.evaluate<StyleEvalRet, StyleEvalArg>(
        (root, arg) => {
          const { max, maxDepth, props, propsMode } = arg;
          const stylesResult: StyleEvalRet['styles'] = {};
          const metaResult: StyleEvalRet['meta'] = {};
          let seen = 0;

          const rec = (el: Element) => {
            const st = getComputedStyle(el);
            const list = propsMode === 'all' ? Array.from(st) : props;
            const out: Record<string, string> = {};
            for (const p of list) {
              out[p] = st.getPropertyValue(p) || '';
            }
            return out;
          };

          const info = (el: Element) => {
            const h = el as HTMLElement; // HTMLElement
            const testid = h.dataset?.testid;
            const tag = h.tagName.toLowerCase();
            const id = h.id ? `#${h.id}` : '';
            const classes =
              typeof h.className === 'string' && h.className
                ? `.${h.className.trim().split(/\s+/).join('.')}`
                : '';

            // Detect element kind for better style diff analysis
            const role = h.getAttribute('role') || undefined;
            const href = (h as HTMLAnchorElement).href || undefined;
            const type = (h as HTMLInputElement | HTMLButtonElement).type || undefined;
            const tabindex = h.getAttribute('tabindex') || undefined;
            const cursor = getComputedStyle(h).cursor || undefined;

            // Classify element kind: interactive, text, or container
            let elementKind: 'interactive' | 'text' | 'container' = 'container';
            const isInteractive =
              tag === 'button' ||
              tag === 'a' ||
              tag === 'input' ||
              tag === 'select' ||
              tag === 'textarea' ||
              role === 'button' ||
              role === 'link' ||
              role === 'tab' ||
              role === 'menuitem' ||
              cursor === 'pointer';
            const isText = /^(p|h[1-6]|span|label|li|a)$/.test(tag);

            if (isInteractive) {
              elementKind = 'interactive';
            } else if (isText) {
              elementKind = 'text';
            }

            return {
              tag,
              id: h.id || undefined,
              class: h.className || undefined,
              testid,
              cssSelector: testid ? `[data-testid="${testid}"]` : `${tag}${id}${classes}`,
              height: h.offsetHeight || 0,
              role,
              href,
              type,
              tabindex,
              cursor,
              elementKind,
            };
          };

          const walk = (el: Element, path: string, depth: number) => {
            if (seen++ >= max) return;
            stylesResult[path] = rec(el);
            metaResult[path] = info(el);
            if (depth >= maxDepth) return;
            const kids = Array.from(el.children);
            for (let i = 0; i < kids.length && seen < max; i++) {
              const kid = kids[i];
              if (kid) {
                walk(kid, `${path} > :nth-child(${i + 1})`, depth + 1);
              }
            }
          };

          walk(root, '__self__', 0);
          return { styles: stylesResult, meta: metaResult };
        },
        {
          max: opts.maxChildren ?? DEFAULT_CONFIG.capture.defaultMaxChildren,
          maxDepth: opts.maxDepth ?? DEFAULT_CONFIG.capture.defaultMaxDepth,
          propsMode: opts.propsMode ?? 'extended',
          props: Array.from(
            (opts.propsMode ?? 'extended') === 'default' ? DEFAULT_PROPS : EXTENDED_PROPS
          ) as string[],
        }
      );

      if (effectiveReuse) {
        await browserPool.closeContext(context);
      } else {
        await context.close();
        if (shouldCloseBrowser) {
          await browser.close();
        }
      }
      return { implPng: Buffer.from(implPng), styles, box, childBox, meta };
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
