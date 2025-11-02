import type { Page } from '@playwright/test';

/**
 * Liveness check result for a selector
 */
export interface LivenessResult {
  /**
   * The selector that was checked
   */
  selector: string;

  /**
   * Whether the selector is alive (found and visible)
   */
  isAlive: boolean;

  /**
   * Element state if found
   */
  state?: 'visible' | 'hidden' | 'not_found';

  /**
   * Error message if check failed
   */
  error?: string;

  /**
   * Time taken to check (in milliseconds)
   */
  checkTime: number;
}

/**
 * Options for liveness check
 */
export interface LivenessCheckOptions {
  /**
   * Timeout for selector check in milliseconds
   * @default 5000
   */
  timeout?: number;

  /**
   * Whether to check visibility (if false, only checks existence)
   * @default true
   */
  checkVisibility?: boolean;

  /**
   * Whether to wait for the selector to appear
   * @default false
   */
  waitForSelector?: boolean;
}

/**
 * Check if a selector is alive (exists and optionally visible) on a page
 *
 * @param page - Playwright page instance
 * @param selector - Selector to check
 * @param options - Check options
 * @returns Liveness result
 */
export async function checkLiveness(
  page: Page,
  selector: string,
  options: LivenessCheckOptions = {}
): Promise<LivenessResult> {
  const { timeout = 5000, checkVisibility = true, waitForSelector = false } = options;

  const startTime = Date.now();

  try {
    // Wait for selector if requested
    if (waitForSelector) {
      await page.waitForSelector(selector, { timeout, state: 'attached' });
    }

    // Check if element exists
    const element = await page.$(selector);

    if (!element) {
      return {
        selector,
        isAlive: false,
        state: 'not_found',
        checkTime: Date.now() - startTime,
      };
    }

    // Check visibility if requested
    if (checkVisibility) {
      const isVisible = await element.isVisible();

      return {
        selector,
        isAlive: isVisible,
        state: isVisible ? 'visible' : 'hidden',
        checkTime: Date.now() - startTime,
      };
    }

    // Element exists (visibility not checked)
    return {
      selector,
      isAlive: true,
      state: 'visible', // Assume visible if not checking
      checkTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      selector,
      isAlive: false,
      state: 'not_found',
      error: error instanceof Error ? error.message : String(error),
      checkTime: Date.now() - startTime,
    };
  }
}

/**
 * Check liveness for multiple selectors in priority order
 * Returns the first alive selector
 *
 * @param page - Playwright page instance
 * @param selectors - Selectors to check in priority order
 * @param options - Check options
 * @returns First alive selector result, or null if none are alive
 */
export async function checkLivenessPriority(
  page: Page,
  selectors: string[],
  options: LivenessCheckOptions = {}
): Promise<LivenessResult | null> {
  for (const selector of selectors) {
    const result = await checkLiveness(page, selector, options);

    if (result.isAlive) {
      return result;
    }
  }

  return null;
}

/**
 * Check liveness for all selectors and return results
 *
 * @param page - Playwright page instance
 * @param selectors - Selectors to check
 * @param options - Check options
 * @returns Array of liveness results
 */
export async function checkLivenessAll(
  page: Page,
  selectors: string[],
  options: LivenessCheckOptions = {}
): Promise<LivenessResult[]> {
  const results: LivenessResult[] = [];

  for (const selector of selectors) {
    const result = await checkLiveness(page, selector, options);
    results.push(result);
  }

  return results;
}
