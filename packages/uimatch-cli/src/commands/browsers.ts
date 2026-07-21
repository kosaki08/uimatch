import { browserPool } from '@uimatch/core';

/**
 * Close the browsers kept alive by comparisons that opted into `reuseBrowser`.
 *
 * A comparison run with the default `reuseBrowser: false` owns and closes its
 * own browser, so callers only need this when they pass `reuseBrowser: true`.
 * Because the pool is process-wide, this closes every pooled context: call it
 * once, after all concurrent comparisons have settled.
 */
export async function closeUiMatchBrowsers(): Promise<void> {
  await browserPool.closeAll();
}
