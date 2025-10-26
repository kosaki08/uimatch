import { captureTarget, compareImages } from 'uimatch-core';
import { getFramePng, parseFigmaRef } from '../figma-mcp.ts';

/**
 * Acceptance thresholds for UI comparison.
 */
type Thresholds = {
  /**
   * Maximum acceptable pixel difference ratio (0 to 1).
   */
  pixelDiffRatio?: number;

  /**
   * Maximum acceptable color Delta E (CIEDE2000).
   */
  deltaE?: number;
};

/**
 * Compares a Figma design with a live implementation.
 *
 * @param args - Comparison parameters
 * @returns Summary string and detailed comparison report
 *
 * @example
 * ```typescript
 * const result = await uiMatchCompare({
 *   figma: 'abc123:1-2',
 *   story: 'http://localhost:6006/?path=/story/button',
 *   selector: '#root button',
 * });
 * ```
 */
export async function uiMatchCompare(args: {
  /**
   * Figma reference (URL or `fileKey:nodeId`).
   */
  figma: string;

  /**
   * Target URL (Storybook or any web page).
   */
  story: string;

  /**
   * CSS selector for the component root.
   */
  selector: string;

  /**
   * Viewport dimensions.
   */
  viewport?: { width: number; height: number };

  /**
   * Device pixel ratio.
   * @default 1
   */
  dpr?: number;

  /**
   * Acceptance thresholds (Phase 3).
   */
  thresholds?: Thresholds;

  /**
   * Whether to include PNG artifacts in the report.
   */
  emitArtifacts?: boolean;

  /**
   * Font URLs to preload.
   */
  fontPreload?: string[];
}) {
  const { fileKey, nodeId } = parseFigmaRef(args.figma);

  // Use dpr=1 as default for MVP to ensure Figma scale and Playwright dpr match
  const dpr = args.dpr ?? 1;

  // 1) Fetch Figma PNG (MCP) - scale must match dpr to avoid size mismatch
  const figmaPng = await getFramePng({ fileKey, nodeId, scale: dpr });
  // Variables will be used in Phase 3 for TokenMap matching
  // const variables = await getVariables({ fileKey });

  // 2) Capture implementation (Playwright)
  const cap = await captureTarget({
    url: args.story,
    selector: args.selector,
    viewport: args.viewport,
    dpr,
    fontPreloads: args.fontPreload,
    basicAuth:
      process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASS
        ? { username: process.env.BASIC_AUTH_USER, password: process.env.BASIC_AUTH_PASS }
        : undefined,
  });

  // 3) Image diff (reuse Phase 1 synchronous compare)
  const result = compareImages({
    figmaPngB64: figmaPng.toString('base64'),
    implPngB64: cap.implPng.toString('base64'),
    pixelmatch: { threshold: 0.1, includeAA: true },
  });

  // 4) Return (DFS will be introduced in Phase 3, focus on metrics here)
  const summary = [
    `pixelDiffRatio: ${(result.pixelDiffRatio * 100).toFixed(2)}%`,
    `diffPixelCount: ${result.diffPixelCount}`,
    `box: ${Math.round(cap.box.width)}×${Math.round(cap.box.height)} at (${Math.round(cap.box.x)},${Math.round(cap.box.y)})`,
  ].join(' | ');

  return {
    summary,
    report: {
      metrics: { pixelDiffRatio: result.pixelDiffRatio, colorDeltaEAvg: 0, dfs: 0 },
      styleDiffs: Object.entries(cap.styles).map(([sel, props]) => ({
        path: sel === '__self__' ? 'self' : sel,
        selector: sel,
        properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, { actual: v }])),
        severity: 'low' as const,
      })),
      artifacts: args.emitArtifacts
        ? {
            figmaPngB64: figmaPng.toString('base64'),
            implPngB64: cap.implPng.toString('base64'),
            diffPngB64: result.diffPngB64,
          }
        : undefined,
    },
  };
}
