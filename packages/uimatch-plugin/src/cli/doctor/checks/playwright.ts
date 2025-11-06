/**
 * Playwright checks - browser availability and basic launch test
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import type { DoctorCheck } from '../types.js';

export const checkPlaywrightInstalled: DoctorCheck = async (ctx) => {
  const t0 = Date.now();
  try {
    // Check if playwright is installed
    await import('playwright');

    return {
      id: 'playwright:installed',
      title: 'Playwright package',
      status: 'pass',
      severity: 'high',
      durationMs: Date.now() - t0,
      details: 'Playwright package is installed',
      category: 'playwright',
    };
  } catch (e) {
    return {
      id: 'playwright:installed',
      title: 'Playwright package',
      status: 'fail',
      severity: 'critical',
      durationMs: Date.now() - t0,
      details: 'Playwright package not found. Run: npm install playwright',
      category: 'playwright',
    };
  }
};

export const checkChromiumBrowser: DoctorCheck = async (ctx) => {
  const t0 = Date.now();
  try {
    const { chromium } = await import('playwright');
    const headless = process.env.UIMATCH_HEADLESS !== 'false';

    const browser = await chromium.launch({ headless, timeout: 10000 });
    await browser.close();

    return {
      id: 'playwright:chromium',
      title: 'Chromium browser launch',
      status: 'pass',
      severity: 'high',
      durationMs: Date.now() - t0,
      details: `Chromium launched successfully (headless: ${headless})`,
      category: 'playwright',
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isMissingBrowser = message.includes('Executable') || message.includes('browser');

    return {
      id: 'playwright:chromium',
      title: 'Chromium browser launch',
      status: 'fail',
      severity: 'critical',
      durationMs: Date.now() - t0,
      details: isMissingBrowser
        ? 'Chromium not installed. Run: npx playwright install chromium'
        : message,
      category: 'playwright',
    };
  }
};

export const checkPlaywrightBasicCapture: DoctorCheck = async (ctx) => {
  const t0 = Date.now();
  try {
    const { chromium } = await import('playwright');
    const headless = process.env.UIMATCH_HEADLESS !== 'false';

    const browser = await chromium.launch({ headless, timeout: 10000 });
    const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await context.newPage();

    await page.setContent(
      "<html><body><div id='test-box' style='width:100px;height:100px;background:#f00'></div></body></html>"
    );

    const element = await page.$('#test-box');
    const captured = !!element;

    await context.close();
    await browser.close();

    return {
      id: 'playwright:capture',
      title: 'Playwright element capture',
      status: captured ? 'pass' : 'fail',
      severity: 'medium',
      durationMs: Date.now() - t0,
      details: captured
        ? 'Element capture and basic page operations work'
        : 'Failed to capture test element',
      category: 'playwright',
    };
  } catch (e) {
    return {
      id: 'playwright:capture',
      title: 'Playwright element capture',
      status: 'fail',
      severity: 'medium',
      durationMs: Date.now() - t0,
      details: String(e),
      category: 'playwright',
    };
  }
};

export const playwrightChecks: DoctorCheck[] = [
  checkPlaywrightInstalled,
  checkChromiumBrowser,
  checkPlaywrightBasicCapture,
];
