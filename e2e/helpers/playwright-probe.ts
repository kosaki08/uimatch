/**
 * Playwright-based Probe implementation for E2E tests
 * Implements the SPI Probe interface using Playwright Page
 */

import type { Page } from '@playwright/test';
import type { Probe, ProbeOptions, ProbeResult } from '@uimatch/selector-spi';

/**
 * Create a Probe instance that uses Playwright Page for liveness checking
 */
export function createPlaywrightProbe(page: Page): Probe {
  return {
    async check(selector: string, options?: ProbeOptions): Promise<ProbeResult> {
      const startTime = Date.now();

      try {
        const timeout = options?.timeoutMs ?? 3000;
        const checkVisibility = options?.visible ?? true;

        // Try to find the element
        const locator = page.locator(selector).first();

        // Wait for element to exist (attached to DOM)
        await locator.waitFor({
          state: 'attached',
          timeout,
        });

        // If visibility check is required, also check if visible
        if (checkVisibility) {
          const isVisible: boolean = await locator.isVisible({ timeout: 100 });

          return {
            selector,
            isValid: isVisible,
            isAlive: isVisible, // backward compatibility
            checkTime: Date.now() - startTime,
          };
        }

        // Element exists but visibility not checked
        return {
          selector,
          isValid: true,
          isAlive: true, // backward compatibility
          checkTime: Date.now() - startTime,
        };
      } catch (err: unknown) {
        // Element not found or timeout
        return {
          selector,
          isValid: false,
          isAlive: false, // backward compatibility
          error: err instanceof Error ? err.message : String(err),
          checkTime: Date.now() - startTime,
        };
      }
    },
  };
}
