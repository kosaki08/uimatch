import { chromium, type Browser, type BrowserContext } from 'playwright';
import { afterEach, expect, test, vi } from 'vitest';
import { browserPool } from './browser-pool';

afterEach(async () => {
  await browserPool.closeAll().catch(() => undefined);
  vi.restoreAllMocks();
});

function createContext(close: () => Promise<void>): BrowserContext {
  return {
    close,
    on: vi.fn(() => undefined),
  } as unknown as BrowserContext;
}

function mockBrowser(contexts: BrowserContext[], close: () => Promise<void>): Browser {
  const browser = {
    close,
    isConnected: vi.fn(() => true),
    newContext: vi.fn(() => Promise.resolve(contexts.shift() as BrowserContext)),
    once: vi.fn(() => undefined),
  } as unknown as Browser;
  vi.spyOn(chromium, 'launch').mockResolvedValue(browser);
  return browser;
}

test('closes every context and the browser', async () => {
  const closeFirstContext = vi.fn(() => Promise.resolve());
  const closeSecondContext = vi.fn(() => Promise.resolve());
  const closeBrowser = vi.fn(() => Promise.resolve());
  mockBrowser([createContext(closeFirstContext), createContext(closeSecondContext)], closeBrowser);
  await browserPool.createContext({});
  await browserPool.createContext({});

  await browserPool.closeAll();

  expect(closeFirstContext).toHaveBeenCalledTimes(1);
  expect(closeSecondContext).toHaveBeenCalledTimes(1);
  expect(closeBrowser).toHaveBeenCalledTimes(1);
});

test('closes the browser and reports context cleanup failures', async () => {
  const closeFailingContext = vi.fn(() => Promise.reject(new Error('context close failed')));
  const closeOtherContext = vi.fn(() => Promise.resolve());
  const closeBrowser = vi.fn(() => Promise.resolve());
  mockBrowser([createContext(closeFailingContext), createContext(closeOtherContext)], closeBrowser);
  await browserPool.createContext({});
  await browserPool.createContext({});

  let closeError: unknown;
  try {
    await browserPool.closeAll();
  } catch (error) {
    closeError = error;
  }

  expect(closeError).toBeInstanceOf(AggregateError);
  expect(closeError).toHaveProperty('message', 'Failed to close browser pool');
  expect(closeFailingContext).toHaveBeenCalledTimes(1);
  expect(closeOtherContext).toHaveBeenCalledTimes(1);
  expect(closeBrowser).toHaveBeenCalledTimes(1);
});
