/**
 * Browser pool for reusing Playwright browser instances
 * Improves performance for /loop by avoiding repeated browser launches
 */

import type { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';

/**
 * Singleton browser pool manager
 */
class BrowserPool {
  private browser: Browser | null = null;
  private contexts: Set<BrowserContext> = new Set();
  private disconnectListenerAttached = false;
  private launching: Promise<Browser> | null = null;

  /**
   * Get or create a shared browser instance.
   * Prevents race conditions by ensuring only one launch at a time.
   */
  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    // If already launching, wait for that launch to complete
    if (this.launching) {
      return this.launching;
    }

    // Launch browser with environment-controlled options
    const launchOpts = {
      headless: process.env.UIMATCH_HEADLESS !== 'false',
      channel: process.env.UIMATCH_CHROME_CHANNEL as 'chrome' | 'msedge' | undefined,
      args: process.env.UIMATCH_CHROME_ARGS?.split(' ') ?? [],
    };

    this.launching = chromium
      .launch(launchOpts)
      .then((b) => {
        this.browser = b;
        this.disconnectListenerAttached = false;
        return b;
      })
      .finally(() => {
        this.launching = null;
      });

    return this.launching;
  }

  /**
   * Create a new browser context
   * Contexts are lightweight and can be created for each comparison
   */
  async createContext(options: {
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
    httpCredentials?: { username: string; password: string };
  }): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const context = await browser.newContext(options);
    this.contexts.add(context);

    // Auto-cleanup when context closes
    context.on('close', () => this.contexts.delete(context));

    // Clean up all contexts if browser disconnects (first time only)
    if (this.browser && !this.disconnectListenerAttached) {
      const currentBrowser = this.browser;
      currentBrowser.once('disconnected', () => {
        this.contexts.clear();
        this.browser = null;
        this.disconnectListenerAttached = false;
      });
      this.disconnectListenerAttached = true;
    }

    return context;
  }

  /**
   * Close a specific context
   */
  async closeContext(context: BrowserContext): Promise<void> {
    await context.close();
    this.contexts.delete(context);
  }

  /**
   * Close all contexts and the browser
   */
  async closeAll(): Promise<void> {
    // Close all contexts first
    await Promise.all(Array.from(this.contexts).map((ctx) => ctx.close()));
    this.contexts.clear();

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Check if browser is active
   */
  isActive(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}

/**
 * Singleton instance
 */
export const browserPool = new BrowserPool();
