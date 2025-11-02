import { expect, test } from '@playwright/test';
import {
  checkLiveness,
  checkLivenessAll,
  checkLivenessPriority,
} from '../packages/uimatch-plugin/src/selectors/liveness.js';

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

test.describe('Liveness Check', () => {
  test('detects visible element', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const result = await checkLiveness(page, '[data-testid="visible-element"]');

    expect(result.isAlive).toBe(true);
    expect(result.state).toBe('visible');
    expect(result.selector).toBe('[data-testid="visible-element"]');
    expect(result.error).toBeUndefined();
    expect(result.checkTime).toBeGreaterThan(0);
  });

  test('detects hidden element', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const result = await checkLiveness(page, '[data-testid="hidden-element"]');

    expect(result.isAlive).toBe(false);
    expect(result.state).toBe('hidden');
    expect(result.selector).toBe('[data-testid="hidden-element"]');
  });

  test('detects non-existent element', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const result = await checkLiveness(page, '[data-testid="non-existent"]');

    expect(result.isAlive).toBe(false);
    expect(result.state).toBe('not_found');
    expect(result.selector).toBe('[data-testid="non-existent"]');
  });

  test('works with different selector types', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const idResult = await checkLiveness(page, '#test-button');
    expect(idResult.isAlive).toBe(true);
    expect(idResult.state).toBe('visible');

    const classResult = await checkLiveness(page, '.test-class');
    expect(classResult.isAlive).toBe(true);
    expect(classResult.state).toBe('visible');
  });

  test('respects checkVisibility option', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    // Don't check visibility - just existence
    const result = await checkLiveness(page, '[data-testid="hidden-element"]', {
      checkVisibility: false,
    });

    expect(result.isAlive).toBe(true); // Element exists
    expect(result.state).toBe('visible'); // Assumed visible when not checking
  });

  test('respects timeout option', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const startTime = Date.now();

    const result = await checkLiveness(page, '[data-testid="never-appears"]', {
      timeout: 100,
    });

    const elapsed = Date.now() - startTime;

    expect(result.isAlive).toBe(false);
    expect(elapsed).toBeLessThan(200); // Should timeout quickly
  });

  test('handles waitForSelector option', async ({ page }) => {
    // Set empty content first
    await page.setContent('<html><body></body></html>');

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
    const result = await checkLiveness(page, '[data-testid="delayed-element"]', {
      waitForSelector: true,
      timeout: 1000,
    });

    expect(result.isAlive).toBe(true);
    expect(result.state).toBe('visible');
  });

  test('returns error message on invalid selector', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const result = await checkLiveness(page, '>>>invalid<<<');

    expect(result.isAlive).toBe(false);
    expect(result.state).toBe('not_found');
    expect(result.error).toBeDefined();
  });
});

test.describe('checkLivenessPriority', () => {
  test('returns first alive selector', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const selectors = [
      '[data-testid="non-existent"]',
      '[data-testid="hidden-element"]',
      '[data-testid="visible-element"]',
      '#test-button',
    ];

    const result = await checkLivenessPriority(page, selectors);

    expect(result).not.toBeNull();
    expect(result?.selector).toBe('[data-testid="visible-element"]');
    expect(result?.isAlive).toBe(true);
  });

  test('returns null when no selectors are alive', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const selectors = [
      '[data-testid="non-existent-1"]',
      '[data-testid="non-existent-2"]',
      '[data-testid="non-existent-3"]',
    ];

    const result = await checkLivenessPriority(page, selectors);

    expect(result).toBeNull();
  });

  test('skips hidden elements when checking visibility', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const selectors = [
      '[data-testid="non-existent"]',
      '[data-testid="hidden-element"]',
      '#test-button',
    ];

    const result = await checkLivenessPriority(page, selectors, {
      checkVisibility: true,
    });

    expect(result).not.toBeNull();
    expect(result?.selector).toBe('#test-button'); // Skips hidden element
    expect(result?.isAlive).toBe(true);
  });

  test('includes hidden elements when not checking visibility', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const selectors = [
      '[data-testid="non-existent"]',
      '[data-testid="hidden-element"]',
      '#test-button',
    ];

    const result = await checkLivenessPriority(page, selectors, {
      checkVisibility: false,
    });

    expect(result).not.toBeNull();
    expect(result?.selector).toBe('[data-testid="hidden-element"]'); // Finds hidden element
    expect(result?.isAlive).toBe(true);
  });
});

test.describe('checkLivenessAll', () => {
  test('checks all selectors and returns results', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const selectors = [
      '[data-testid="visible-element"]',
      '[data-testid="hidden-element"]',
      '[data-testid="non-existent"]',
      '#test-button',
    ];

    const results = await checkLivenessAll(page, selectors);

    expect(results).toHaveLength(4);

    const visibleResult = results[0];
    if (!visibleResult) throw new Error('Missing result 0');
    expect(visibleResult.isAlive).toBe(true);
    expect(visibleResult.state).toBe('visible');

    const hiddenResult = results[1];
    if (!hiddenResult) throw new Error('Missing result 1');
    expect(hiddenResult.isAlive).toBe(false);
    expect(hiddenResult.state).toBe('hidden');

    const notFoundResult = results[2];
    if (!notFoundResult) throw new Error('Missing result 2');
    expect(notFoundResult.isAlive).toBe(false);
    expect(notFoundResult.state).toBe('not_found');

    const buttonResult = results[3];
    if (!buttonResult) throw new Error('Missing result 3');
    expect(buttonResult.isAlive).toBe(true);
    expect(buttonResult.state).toBe('visible');
  });

  test('measures check time for each selector', async ({ page }) => {
    await page.setContent(HTML_CONTENT);
    const selectors = ['#test-button', '.test-class'];

    const results = await checkLivenessAll(page, selectors);

    expect(results).toHaveLength(2);

    const result0 = results[0];
    if (!result0) throw new Error('Missing result 0');
    expect(result0.checkTime).toBeGreaterThan(0);

    const result1 = results[1];
    if (!result1) throw new Error('Missing result 1');
    expect(result1.checkTime).toBeGreaterThan(0);
  });
});
