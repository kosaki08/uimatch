/**
 * Adapter interfaces for external dependencies
 */

/**
 * Configuration options for capturing a web page element.
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

  /**
   * Reuse shared Playwright browser via browserPool.
   * Improves performance for repeated comparisons (e.g., in /loop).
   * @default false
   */
  reuseBrowser?: boolean;
}

/**
 * DOM element metadata for generating precise selectors.
 */
export interface ElementMeta {
  /** HTML tag name (e.g., 'button', 'div') */
  tag: string;
  /** Element ID attribute (if present) */
  id?: string;
  /** Element class names (if present) */
  class?: string;
  /** data-testid attribute (if present) */
  testid?: string;
  /** Generated CSS selector for this element */
  cssSelector?: string;
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

  /**
   * DOM element metadata keyed by selector.
   * Provides additional context for generating precise CSS selectors and code examples.
   */
  meta?: Record<string, ElementMeta>;
}

/**
 * Interface for browser automation adapters.
 * Abstracts browser automation tools like Playwright, Puppeteer, etc.
 */
export interface BrowserAdapter {
  /**
   * Capture a screenshot and styles from a web page element.
   * @param options - Capture configuration
   * @returns Screenshot, styles, and bounding box
   */
  captureTarget(options: CaptureOptions): Promise<CaptureResult>;
}
