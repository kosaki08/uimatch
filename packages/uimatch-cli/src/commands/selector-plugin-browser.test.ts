/**
 * Browser ownership on the selector plugin path.
 * Mirrors uimatch-core's playwright-cleanup tests: a call that does not opt into
 * the shared pool must close whatever it started, including on failure.
 */
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { RED_10X10_PNG_B64 } from '../../../../test-utils/browser-fixtures.js';
import { uiMatchCompare } from './compare.js';

const STUB_PLUGIN = `data:text/javascript,${encodeURIComponent(`
  export default {
    name: 'ownership-stub',
    version: '1.0.0',
    resolve: async () => ({ selector: '#test' }),
  };
`)}`;

function compareWithPlugin(): Promise<unknown> {
  return uiMatchCompare({
    figma: 'test:1-2',
    story: 'data:text/html,<div id="test"></div>',
    selector: '#test',
    selectorsPlugin: STUB_PLUGIN,
  });
}

let originalFigmaPngB64: string | undefined;

beforeEach(() => {
  originalFigmaPngB64 = process.env.UIMATCH_FIGMA_PNG_B64;
  process.env.UIMATCH_FIGMA_PNG_B64 = RED_10X10_PNG_B64;
});

afterEach(() => {
  if (originalFigmaPngB64 === undefined) {
    delete process.env.UIMATCH_FIGMA_PNG_B64;
  } else {
    process.env.UIMATCH_FIGMA_PNG_B64 = originalFigmaPngB64;
  }
  vi.restoreAllMocks();
});

test('closes the launched browser when the plugin context cannot be created', async () => {
  const close = vi.fn(() => Promise.resolve());
  const browser = {
    newContext: vi.fn(() => Promise.reject(new Error('newContext failed'))),
    close,
  } as unknown as Browser;
  vi.spyOn(chromium, 'launch').mockResolvedValue(browser);

  await expect(compareWithPlugin()).rejects.toThrow('newContext failed');

  expect(close).toHaveBeenCalledTimes(1);
});

test('closes the launched browser when the plugin page cannot be opened', async () => {
  const closeContext = vi.fn(() => Promise.resolve());
  const context = {
    newPage: vi.fn(() => Promise.reject(new Error('newPage failed'))),
    close: closeContext,
  } as unknown as BrowserContext;

  const close = vi.fn(() => Promise.resolve());
  const browser = {
    newContext: vi.fn(() => Promise.resolve(context)),
    close,
  } as unknown as Browser;
  vi.spyOn(chromium, 'launch').mockResolvedValue(browser);

  await expect(compareWithPlugin()).rejects.toThrow('newPage failed');

  expect(closeContext).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
