/**
 * UI comparison command
 */

import type { CaptureResult, CompareImageResult } from 'uimatch-core';
import { captureTarget, compareImages } from 'uimatch-core';
import { FigmaRestClient } from '../adapters/figma-rest';
import { FigmaMcpClient, parseFigmaRef } from '../adapters/index';
import { loadFigmaMcpConfig, loadSkillConfig } from '../config/index';
import type { CompareArgs, CompareResult } from '../types/index';
import { getSettings } from './settings';

/**
 * Read PNG dimensions from IHDR chunk (bytes 16-23).
 * Lightweight alternative to pngjs for simple size detection.
 *
 * @param buffer - PNG image buffer
 * @returns Width and height, or null if invalid PNG
 */
function readPngSize(buffer: Buffer): { width: number; height: number } | null {
  // PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4) + data (13) + CRC (4) = 24 bytes minimum
  if (buffer.length < 24) return null;

  // Verify IHDR chunk signature at bytes 12-15
  const ihdrSignature = buffer.readUInt32BE(12);
  if (ihdrSignature !== 0x49484452) return null; // "IHDR" in hex

  // Read width and height from IHDR data (bytes 16-23)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width <= 0 || height <= 0) return null;

  return { width, height };
}

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
  const cfg = loadSkillConfig();
  const settings = getSettings(); // Read from .uimatchrc.json if exists

  // Use default DPR from config (defaults to 2), clamped to Figma scale limits (1-4)
  // Note: Figma API typically requires scale >= 1.0
  const dprRaw = args.dpr ?? cfg.defaultDpr;
  const dpr = Math.max(1, Math.min(dprRaw, 4));

  // Configure pixelmatch with settings fallback
  const pixelmatch = {
    threshold: args.pixelmatch?.threshold ?? settings.comparison.pixelmatchThreshold,
    includeAA: args.pixelmatch?.includeAA ?? settings.comparison.includeAA,
  };

  // 1) Prepare Figma PNG with fallback priority: env bypass > REST fallback > MCP
  let figmaPng: Buffer;
  let fileKey: string;
  let nodeId: string;
  let figmaClient: FigmaMcpClient | null = null;

  // Check for bypass mode first to avoid parsing figma reference if not needed
  const b64raw = process.env.UIMATCH_FIGMA_PNG_B64?.trim();

  // Parse Figma reference only when needed (not in bypass mode)
  let parsed: ReturnType<typeof parseFigmaRef> | null = null;
  if (!b64raw) {
    parsed = parseFigmaRef(args.figma);
  }

  // Debug: Display effective mode and parsed reference
  console.log(
    '[uimatch] mode:',
    b64raw ? 'BYPASS' : process.env.FIGMA_ACCESS_TOKEN ? 'REST' : 'MCP',
    '| figma arg:',
    args.figma
  );

  if (b64raw) {
    // Environment variable bypass: Accept base64 PNG directly from Claude
    const b64 = b64raw.replace(/^data:image\/png;base64,/, '').replace(/\s+/g, '');
    figmaPng = Buffer.from(b64, 'base64');
    // Try to parse reference for metadata, but don't fail if invalid
    try {
      const parsedRef = parseFigmaRef(args.figma);
      if (parsedRef !== 'current') {
        fileKey = parsedRef.fileKey;
        nodeId = parsedRef.nodeId;
      } else {
        fileKey = 'env-bypass';
        nodeId = 'env-bypass';
      }
    } catch {
      // Invalid reference with bypass is OK - use placeholder
      fileKey = 'env-bypass';
      nodeId = 'env-bypass';
    }
  } else if (process.env.FIGMA_ACCESS_TOKEN && parsed && parsed !== 'current') {
    // REST fallback: Use Figma REST API (no MCP required)
    const rest = new FigmaRestClient(process.env.FIGMA_ACCESS_TOKEN);
    const { fileKey: fk, nodeId: nid } = parsed; // URL or shorthand already resolved
    figmaPng = await rest.getFramePng({ fileKey: fk, nodeId: nid, scale: dpr });
    fileKey = fk;
    nodeId = nid;
  } else {
    // Early validation: If no PAT and trying to use URL/fileKey:nodeId format,
    // provide clear guidance before attempting MCP
    if (!process.env.FIGMA_ACCESS_TOKEN && parsed && parsed !== 'current') {
      throw new Error(
        'FIGMA_ACCESS_TOKEN is not set. ' +
          'To compare using URL or fileKey:nodeId format, you must set FIGMA_ACCESS_TOKEN. ' +
          'Alternatively, use figma=current to compare the currently selected node in Figma Desktop ' +
          '(requires MCP server).'
      );
    }

    // MCP path: Use existing MCP client (only supports 'current' reliably)
    if (!parsed) throw new Error('Figma reference must be parsed for MCP mode');
    const mcpConfig = loadFigmaMcpConfig();
    figmaClient = new FigmaMcpClient(mcpConfig);
    if (parsed === 'current') {
      const sel = await figmaClient.getCurrentSelectionRef();
      fileKey = sel.fileKey;
      nodeId = sel.nodeId;
    } else {
      fileKey = parsed.fileKey;
      nodeId = parsed.nodeId;
    }
    figmaPng = await figmaClient.getFramePng({ fileKey, nodeId, scale: dpr });
  }
  // Variables will be used in Phase 3 for TokenMap matching
  // const variables = await figmaClient.getVariables({ fileKey });

  // Auto-detect viewport from Figma PNG if not explicitly provided
  let effectiveViewport = args.viewport;
  if (!effectiveViewport) {
    const pngSize = readPngSize(figmaPng);
    if (pngSize && pngSize.width > 0 && pngSize.height > 0) {
      effectiveViewport = { width: pngSize.width, height: pngSize.height };
      console.log(
        `[uimatch] Auto-detected viewport from Figma PNG: ${pngSize.width}x${pngSize.height}`
      );
    }
  }

  // 2) Capture implementation (Playwright)
  const cap: CaptureResult = await captureTarget({
    url: args.story,
    selector: args.selector,
    viewport: effectiveViewport,
    dpr,
    detectStorybookIframe: args.detectStorybookIframe,
    fontPreloads: args.fontPreload,
    idleWaitMs: settings.capture.defaultIdleWaitMs,
    reuseBrowser: args.reuseBrowser,
    basicAuth:
      args.basicAuth ??
      (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASS
        ? { username: process.env.BASIC_AUTH_USER, password: process.env.BASIC_AUTH_PASS }
        : undefined),
  });

  // 3) Image diff with style comparison
  const result: CompareImageResult = compareImages({
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
  const hasHighSeverity = styleDiffs.some((d: { severity: string }) => d.severity === 'high');

  // Quality gate evaluation using settings
  const tPix = args.thresholds?.pixelDiffRatio ?? settings.comparison.acceptancePixelDiffRatio;
  const tDe = args.thresholds?.deltaE ?? settings.comparison.acceptanceColorDeltaE;
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

  // Calculate Design Fidelity Score (0-100) with optional weights
  const weights = {
    pixel: 1.0,
    color: args.weights?.color ?? 1.0,
    spacing: args.weights?.spacing ?? 1.0,
    radius: args.weights?.radius ?? 1.0,
    border: args.weights?.border ?? 1.0,
    shadow: args.weights?.shadow ?? 1.0,
    typography: args.weights?.typography ?? 1.0,
  };

  // Base score of 100, with weighted deductions for differences
  let dfs = 100;

  // Pixel difference penalty (up to -50 points)
  // 0% diff = 0 penalty, 100% diff = -50 penalty
  dfs -= result.pixelDiffRatio * 50 * weights.pixel;

  // Color delta E penalty (up to -30 points)
  // 0 ΔE = 0 penalty, 10+ ΔE = -30 penalty
  dfs -= Math.min(colorDeltaEAvg / 10, 1) * 30 * weights.color;

  // High severity style diff penalty (-20 points)
  // Apply maximum weight from all categories for severity penalty
  if (hasHighSeverity) {
    const maxWeight = Math.max(
      weights.color,
      weights.spacing,
      weights.typography,
      weights.border,
      weights.shadow,
      weights.radius
    );
    dfs -= 20 * maxWeight;
  }

  // Ensure DFS is in range [0, 100]
  dfs = Math.max(0, Math.min(100, Math.round(dfs)));

  // 5) Generate summary
  const summary = [
    pass ? 'PASS' : 'FAIL',
    `DFS: ${dfs}`,
    `pixelDiffRatio: ${(result.pixelDiffRatio * 100).toFixed(2)}%`,
    `colorDeltaEAvg: ${colorDeltaEAvg.toFixed(2)}`,
    `styleDiffs: ${styleDiffs.length} (high: ${styleDiffs.filter((d: { severity: string }) => d.severity === 'high').length})`,
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
