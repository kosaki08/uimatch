/**
 * UI comparison command
 */

import { captureTarget, compareImages } from 'uimatch-core';
import { FigmaMcpClient, parseFigmaRef } from '../adapters/index';
import { loadFigmaMcpConfig, loadSkillConfig } from '../config/index';
import type { CompareArgs, CompareResult } from '../types/index';

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
export async function uiMatchCompare(args: CompareArgs): Promise<CompareResult> {
  const { fileKey, nodeId } = parseFigmaRef(args.figma);

  // Load configuration from environment
  const mcpConfig = loadFigmaMcpConfig();
  const figmaClient = new FigmaMcpClient(mcpConfig);
  const cfg = loadSkillConfig();

  // Use default DPR from config (defaults to 2)
  const dpr = args.dpr ?? cfg.defaultDpr;

  // Configure pixelmatch with defaults
  const pixelmatch = {
    threshold: args.pixelmatch?.threshold ?? 0.1,
    includeAA: args.pixelmatch?.includeAA ?? false,
  };

  // 1) Fetch Figma PNG (MCP) - scale must match dpr to avoid size mismatch
  const figmaPng = await figmaClient.getFramePng({ fileKey, nodeId, scale: dpr });
  // Variables will be used in Phase 3 for TokenMap matching
  // const variables = await figmaClient.getVariables({ fileKey });

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

  // 3) Image diff with style comparison
  const result = compareImages({
    figmaPngB64: figmaPng.toString('base64'),
    implPngB64: cap.implPng.toString('base64'),
    pixelmatch,
    styles: cap.styles,
    expectedSpec: args.expectedSpec,
    tokens: args.tokens,
    diffOptions: {
      thresholds: {
        deltaE: args.thresholds?.deltaE,
        spacing: args.thresholds?.spacing,
        dimension: args.thresholds?.dimension,
        layoutGap: args.thresholds?.layoutGap,
        radius: args.thresholds?.radius,
        borderWidth: args.thresholds?.borderWidth,
        shadowBlur: args.thresholds?.shadowBlur,
        shadowColorExtraDE: args.thresholds?.shadowColorExtraDE,
      },
      ignore: args.ignore,
      weights: args.weights,
    },
  });

  // 4) Calculate metrics and quality gate
  const colorDeltaEAvg = result.colorDeltaEAvg ?? 0;
  const styleDiffs = result.styleDiffs ?? [];
  const hasHighSeverity = styleDiffs.some((d) => d.severity === 'high');

  // Quality gate evaluation
  const tPix = args.thresholds?.pixelDiffRatio ?? cfg.defaultThresholds.pixelDiffRatio;
  const tDe = args.thresholds?.deltaE ?? cfg.defaultThresholds.deltaE;
  const pass = result.pixelDiffRatio <= tPix && colorDeltaEAvg <= tDe && !hasHighSeverity;

  const reasons: string[] = [];
  if (result.pixelDiffRatio > tPix) {
    reasons.push(
      `pixelDiffRatio ${(result.pixelDiffRatio * 100).toFixed(2)}% > ${(tPix * 100).toFixed(2)}%`
    );
  }
  if (colorDeltaEAvg > tDe) {
    reasons.push(`colorDeltaEAvg ${colorDeltaEAvg.toFixed(2)} > ${tDe.toFixed(2)}`);
  }
  if (hasHighSeverity) {
    reasons.push('high severity style diffs present');
  }

  // Calculate Design Fidelity Score (0-100)
  // Base score of 100, with deductions for differences
  let dfs = 100;

  // Pixel difference penalty (up to -50 points)
  // 0% diff = 0 penalty, 100% diff = -50 penalty
  dfs -= result.pixelDiffRatio * 50;

  // Color delta E penalty (up to -30 points)
  // 0 ΔE = 0 penalty, 10+ ΔE = -30 penalty
  dfs -= Math.min(colorDeltaEAvg / 10, 1) * 30;

  // High severity style diff penalty (-20 points)
  if (hasHighSeverity) {
    dfs -= 20;
  }

  // Ensure DFS is in range [0, 100]
  dfs = Math.max(0, Math.min(100, Math.round(dfs)));

  // 5) Generate summary
  const summary = [
    pass ? 'PASS' : 'FAIL',
    `DFS: ${dfs}`,
    `pixelDiffRatio: ${(result.pixelDiffRatio * 100).toFixed(2)}%`,
    `colorDeltaEAvg: ${colorDeltaEAvg.toFixed(2)}`,
    `styleDiffs: ${styleDiffs.length} (high: ${styleDiffs.filter((d) => d.severity === 'high').length})`,
  ].join(' | ');

  return {
    summary,
    report: {
      metrics: { pixelDiffRatio: result.pixelDiffRatio, colorDeltaEAvg, dfs },
      styleDiffs,
      qualityGate: {
        pass,
        reasons,
        thresholds: { pixelDiffRatio: tPix, deltaE: tDe },
      },
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
