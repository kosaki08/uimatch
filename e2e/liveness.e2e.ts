import { expect, test } from '@playwright/test';
import {
  checkLivenessAll,
  checkLivenessPriority,
} from '../packages/uimatch-selector-anchors/src/utils/liveness.js';
import { createPlaywrightProbe } from './helpers/playwright-probe.js';

const HTML_CONTENT = `
  <!DOCTYPE html>
  <html>
    <head><title>Liveness Test</title></head>
    <body>
      <div data-testid="visible-element" style="display: block;">Visible Element</div>
      <div data-testid="hidden-element" style="display: none;">Hidden Element</div>
      <button id="test-button">Click Me</button>
      <span class="test-class">Test Span</span>
    </body>
  </html>
`;

test.describe('Probe Check (SPI)', () => {
  test('detects visible element', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const result = await probe.check('[data-testid="visible-element"]');

    expect(result.isValid).toBe(true);
    expect(result.isAlive).toBe(true); // backward compatibility
    expect(result.selector).toBe('[data-testid="visible-element"]');
    expect(result.error).toBeUndefined();
    expect(result.checkTime).toBeGreaterThan(0);
  });

  test('detects hidden element', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const result = await probe.check('[data-testid="hidden-element"]');

    expect(result.isValid).toBe(false);
    expect(result.isAlive).toBe(false); // backward compatibility
    expect(result.selector).toBe('[data-testid="hidden-element"]');
  });

  test('detects non-existent element', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const result = await probe.check('[data-testid="non-existent"]');

    expect(result.isValid).toBe(false);
    expect(result.isAlive).toBe(false); // backward compatibility
    expect(result.selector).toBe('[data-testid="non-existent"]');
    expect(result.error).toBeDefined();
  });

  test('works with different selector types', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);

    const idResult = await probe.check('#test-button');
    expect(idResult.isValid).toBe(true);
    expect(idResult.isAlive).toBe(true);

    const classResult = await probe.check('.test-class');
    expect(classResult.isValid).toBe(true);
    expect(classResult.isAlive).toBe(true);
  });

  test('respects visible option', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);

    // Don't check visibility - just existence
    const result = await probe.check('[data-testid="hidden-element"]', {
      visible: false,
    });

    expect(result.isValid).toBe(true); // Element exists
    expect(result.isAlive).toBe(true); // Assumed valid when not checking visibility
  });

  test('respects timeout option', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const startTime = Date.now();

    const result = await probe.check('[data-testid="never-appears"]', {
      timeoutMs: 100,
    });

    const elapsed = Date.now() - startTime;

    expect(result.isValid).toBe(false);
    expect(elapsed).toBeLessThan(300); // Should timeout quickly
  });

  test('handles delayed elements', async ({ page }) => {
    // Set empty content first
    await page.setContent('<html><body></body></html>');
    const probe = createPlaywrightProbe(page);

    // Add element after a delay
    void setTimeout(() => {
      void page.evaluate(() => {
        const div = document.createElement('div');
        div.setAttribute('data-testid', 'delayed-element');
        div.textContent = 'Delayed Element';
        document.body.appendChild(div);
      });
    }, 100);

    // Wait for selector to appear
    const result = await probe.check('[data-testid="delayed-element"]', {
      timeoutMs: 1000,
    });

    expect(result.isValid).toBe(true);
    expect(result.isAlive).toBe(true);
  });

  test('returns error message on invalid selector', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const result = await probe.check('>>>invalid<<<');

    expect(result.isValid).toBe(false);
    expect(result.isAlive).toBe(false);
    expect(result.error).toBeDefined();
  });
});

test.describe('checkLivenessPriority (SPI)', () => {
  test('returns first alive selector', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const selectors = [
      '[data-testid="non-existent"]',
      '[data-testid="hidden-element"]',
      '[data-testid="visible-element"]',
      '#test-button',
    ];

    const result = await checkLivenessPriority(probe, selectors);

    expect(result).not.toBeNull();
    expect(result?.selector).toBe('[data-testid="visible-element"]');
    expect(result?.isValid).toBe(true);
    expect(result?.isAlive).toBe(true); // backward compatibility
  });

  test('returns null when no selectors are alive', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const selectors = [
      '[data-testid="non-existent-1"]',
      '[data-testid="non-existent-2"]',
      '[data-testid="non-existent-3"]',
    ];

    const result = await checkLivenessPriority(probe, selectors);

    expect(result).toBeNull();
  });

  test('skips hidden elements when checking visibility', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const selectors = [
      '[data-testid="non-existent"]',
      '[data-testid="hidden-element"]',
      '#test-button',
    ];

    const result = await checkLivenessPriority(probe, selectors, {
      visible: true,
    });

    expect(result).not.toBeNull();
    expect(result?.selector).toBe('#test-button'); // Skips hidden element
    expect(result?.isValid).toBe(true);
    expect(result?.isAlive).toBe(true);
  });

  test('includes hidden elements when not checking visibility', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const selectors = [
      '[data-testid="non-existent"]',
      '[data-testid="hidden-element"]',
      '#test-button',
    ];

    const result = await checkLivenessPriority(probe, selectors, {
      visible: false,
    });

    expect(result).not.toBeNull();
    expect(result?.selector).toBe('[data-testid="hidden-element"]'); // Finds hidden element
    expect(result?.isValid).toBe(true);
    expect(result?.isAlive).toBe(true);
  });
});

test.describe('checkLivenessAll (SPI)', () => {
  test('checks all selectors and returns results', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const selectors = [
      '[data-testid="visible-element"]',
      '[data-testid="hidden-element"]',
      '[data-testid="non-existent"]',
      '#test-button',
    ];

    const results = await checkLivenessAll(probe, selectors);

    expect(results).toHaveLength(4);

    const visibleResult = results[0];
    if (!visibleResult) throw new Error('Missing result 0');
    expect(visibleResult.isValid).toBe(true);
    expect(visibleResult.isAlive).toBe(true); // backward compatibility

    const hiddenResult = results[1];
    if (!hiddenResult) throw new Error('Missing result 1');
    expect(hiddenResult.isValid).toBe(false);
    expect(hiddenResult.isAlive).toBe(false); // backward compatibility

    const notFoundResult = results[2];
    if (!notFoundResult) throw new Error('Missing result 2');
    expect(notFoundResult.isValid).toBe(false);
    expect(notFoundResult.isAlive).toBe(false); // backward compatibility

    const buttonResult = results[3];
    if (!buttonResult) throw new Error('Missing result 3');
    expect(buttonResult.isValid).toBe(true);
    expect(buttonResult.isAlive).toBe(true); // backward compatibility
  });

  test('measures check time for each selector', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const probe = createPlaywrightProbe(page);
    const selectors = ['#test-button', '.test-class'];

    const results = await checkLivenessAll(probe, selectors);

    expect(results).toHaveLength(2);

    const result0 = results[0];
    if (!result0) throw new Error('Missing result 0');
    expect(result0.checkTime).toBeGreaterThan(0);

    const result1 = results[1];
    if (!result1) throw new Error('Missing result 1');
    expect(result1.checkTime).toBeGreaterThan(0);
  });
});
