/**
 * Liveness checking utilities using SPI Probe interface
 *
 * This module is abstracted from Playwright dependencies.
 * The actual browser interaction is provided through the Probe interface.
 */

import type { Probe, ProbeOptions, ProbeResult } from '@uimatch/selector-spi';

/**
 * Check liveness for multiple selectors in priority order
 * Returns the first alive selector
 *
 * @param probe - Probe instance for liveness checking
 * @param selectors - Selectors to check in priority order
 * @param options - Check options
 * @returns First alive selector result, or null if none are alive
 */
export async function checkLivenessPriority(
  probe: Probe,
  selectors: string[],
  options: ProbeOptions = {}
): Promise<ProbeResult | null> {
  for (const selector of selectors) {
    const result = await probe.check(selector, options);

    if (result.isValid || result.isAlive) {
      return result;
    }
  }

  return null;
}

/**
 * Check liveness for all selectors and return results
 *
 * @param probe - Probe instance for liveness checking
 * @param selectors - Selectors to check
 * @param options - Check options
 * @returns Array of liveness results
 */
export async function checkLivenessAll(
  probe: Probe,
  selectors: string[],
  options: ProbeOptions = {}
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  for (const selector of selectors) {
    const result = await probe.check(selector, options);
    results.push(result);
  }

  return results;
}
