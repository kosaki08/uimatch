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

  /**
   * Get or create a shared browser instance
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch();
    }
    return this.browser;
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
