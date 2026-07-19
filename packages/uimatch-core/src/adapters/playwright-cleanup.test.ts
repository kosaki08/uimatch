import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { browserPool } from './browser-pool';
import { PlaywrightAdapter } from './playwright';

afterEach(() => {
  mock.restore();
});

async function captureError(adapter: PlaywrightAdapter): Promise<unknown> {
  try {
    await adapter.captureTarget({ html: '<div id="target"></div>', selector: '#target' });
    return undefined;
  } catch (error) {
    return error;
  }
}

test('closes a newly created context and browser when newPage fails', async () => {
  const closeContext = mock(() => Promise.resolve());
  const context = {
    newPage: mock(() => Promise.reject(new Error('newPage failed'))),
    close: closeContext,
  } as unknown as BrowserContext;

  const closeBrowser = mock(() => Promise.resolve());
  const browser = {
    newContext: mock(() => Promise.resolve(context)),
    close: closeBrowser,
  } as unknown as Browser;
  spyOn(chromium, 'launch').mockResolvedValue(browser);

  const adapter = new PlaywrightAdapter({ reuseBrowser: false });
  const error = await captureError(adapter);

  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty('message', 'newPage failed');
  expect(closeContext).toHaveBeenCalledTimes(1);
  expect(closeBrowser).toHaveBeenCalledTimes(1);
});

test('preserves the capture error and closes the browser when context cleanup fails', async () => {
  const context = {
    newPage: mock(() => Promise.reject(new Error('newPage failed'))),
    close: mock(() => Promise.reject(new Error('context close failed'))),
  } as unknown as BrowserContext;

  const closeBrowser = mock(() => Promise.resolve());
  const browser = {
    newContext: mock(() => Promise.resolve(context)),
    close: closeBrowser,
  } as unknown as Browser;
  spyOn(chromium, 'launch').mockResolvedValue(browser);

  const error = await captureError(new PlaywrightAdapter({ reuseBrowser: false }));

  expect(error).toHaveProperty('message', 'newPage failed');
  expect(closeBrowser).toHaveBeenCalledTimes(1);
});

test('delegates browser acquisition to the pool in reuse mode', async () => {
  const context = {
    newPage: mock(() => Promise.reject(new Error('newPage failed'))),
  } as unknown as BrowserContext;
  const getBrowser = spyOn(browserPool, 'getBrowser').mockResolvedValue({} as Browser);
  const createContext = spyOn(browserPool, 'createContext').mockResolvedValue(context);
  const closeContext = spyOn(browserPool, 'closeContext').mockResolvedValue();

  const error = await captureError(new PlaywrightAdapter({ reuseBrowser: true }));

  expect(error).toHaveProperty('message', 'newPage failed');
  expect(getBrowser).not.toHaveBeenCalled();
  expect(createContext).toHaveBeenCalledTimes(1);
  expect(closeContext).toHaveBeenCalledWith(context);
});
