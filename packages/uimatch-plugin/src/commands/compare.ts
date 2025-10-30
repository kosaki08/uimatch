/**
 * UI comparison command
 */

import type { CaptureResult, CompareImageResult } from 'uimatch-core';
import { captureTarget, compareImages } from 'uimatch-core';
import { FigmaRestClient } from '../adapters/figma-rest';
import { FigmaMcpClient, parseFigmaRef } from '../adapters/index';
import { loadFigmaMcpConfig, loadSkillConfig } from '../config/index';
import { buildExpectedSpecFromFigma } from '../expected/from-figma';
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
 * Filter style diffs to show only properties with meaningful differences.
 * Removes properties that:
 * - Have no expected value (not defined in expectedSpec)
 * - Have no delta (couldn't be compared or matched exactly)
 * - Match the expected value (no actual difference)
 *
 * @param diffs - Style differences from compareImages
 * @returns Filtered diffs containing only properties with actual differences
 */
function pruneStyleDiffs(
  diffs: Array<{
    selector: string;
    properties: Record<
      string,
      {
        actual?: string;
        expected?: string;
        expectedToken?: string;
        delta?: number;
        unit?: string;
      }
    >;
    severity: 'low' | 'medium' | 'high';
    patchHints?: Array<{
      property: string;
      suggestedValue: string;
      severity: 'low' | 'medium' | 'high';
    }>;
  }>
): typeof diffs {
  return diffs
    .map((d) => ({
      ...d,
      properties: Object.fromEntries(
        Object.entries(d.properties).filter(([, value]) => {
          // Keep property if it has an expected value OR a delta
          // This shows both:
          // 1. Properties that could be compared (have delta)
          // 2. Properties with expected values (even if couldn't calculate delta due to units, tokens, etc.)
          return value?.expected !== undefined || value?.delta !== undefined;
        })
      ),
    }))
    .filter((d) => Object.keys(d.properties).length > 0); // Remove selectors with no differences
}

/**
 * Compares Figma design with implementation.
 *
 * Two-layer comparison:
 * - (A) Pixel: Always executed
 * - (B) Style: Only when `expectedSpec` provided
 *
 * ⚠️ Without expectedSpec: styleDiffs=[], no style penalty (-20pts), DFS may be misleadingly high
 *
 * @param args - Comparison parameters
 * @returns Summary and detailed report
 *
 * @example
 * ```typescript
 * // Recommended: with style comparison
 * await uiMatchCompare({
 *   figma: 'abc123:1-2',
 *   story: 'http://localhost:6006/?path=/story/button',
 *   selector: '#root button',
 *   bootstrapExpectedFromFigma: true, // Auto-generate expectedSpec
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

  // 2.5) Bootstrap expectedSpec from Figma node if requested and none provided
  let expectedSpec = args.expectedSpec;
  if (!expectedSpec && (args.bootstrapExpectedFromFigma ?? false)) {
    if (process.env.FIGMA_ACCESS_TOKEN) {
      try {
        const rest = new FigmaRestClient(process.env.FIGMA_ACCESS_TOKEN);
        const nodeJson = await rest.getNode({ fileKey, nodeId });
        expectedSpec = buildExpectedSpecFromFigma(nodeJson, args.tokens);
        console.log('[uimatch] expectedSpec bootstrapped from Figma node (robust subset).');
      } catch (e) {
        console.warn('[uimatch] bootstrap failed:', (e as Error)?.message ?? String(e));
      }
    } else {
      console.warn('[uimatch] FIGMA_ACCESS_TOKEN is not set; skip expectedSpec bootstrap.');
    }
  }

  // 3) Image diff with style comparison
  const result: CompareImageResult = compareImages({
    figmaPngB64: figmaPng.toString('base64'),
    implPngB64: cap.implPng.toString('base64'),
    pixelmatch,
    styles: cap.styles,
    expectedSpec, // may be undefined → style diffs disabled
    tokens: args.tokens,
    meta: cap.meta,
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
    // Size handling options
    sizeMode: args.sizeMode,
    align: args.align,
    padColor: args.padColor,
    contentBasis: args.contentBasis,
  });

  // 3.5) Filter style diffs to show only properties with actual differences
  // This reduces noise by removing properties that couldn't be compared or matched exactly
  if (result.styleDiffs) {
    result.styleDiffs = pruneStyleDiffs(result.styleDiffs);
  }

  // 4) Calculate metrics and quality gate
  const colorDeltaEAvg = result.colorDeltaEAvg ?? 0;
  const styleDiffs = result.styleDiffs ?? [];

  // Quality gate evaluation using settings
  const tPix = args.thresholds?.pixelDiffRatio ?? settings.comparison.acceptancePixelDiffRatio;
  const tDe = args.thresholds?.deltaE ?? settings.comparison.acceptanceColorDeltaE;

  // Use unified quality gate (V2 logic)
  const { evaluateQualityGate } = await import('uimatch-core');
  const qualityGateResult = evaluateQualityGate(
    result,
    styleDiffs,
    {
      pixelDiffRatio: tPix,
      deltaE: tDe,
      areaGapCritical: 0.15, // V2 thresholds
      areaGapWarning: 0.05,
    },
    args.contentBasis ?? 'union'
  );

  const { pass } = qualityGateResult;

  // Variables needed for DFS calculation
  const effectivePixelDiffRatio = result.pixelDiffRatioContent ?? result.pixelDiffRatio;
  const hasHighSeverity = styleDiffs.some((d: { severity: string }) => d.severity === 'high');

  // Calculate Design Fidelity Score (0-100) with optional weights
  const weights = {
    pixel: args.weights?.pixel ?? 1.0,
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
  // Use effective ratio (content-only when available) for more accurate scoring
  dfs -= effectivePixelDiffRatio * 50 * weights.pixel;

  // Color delta E penalty (up to -30 points)
  // 0 ΔE = 0 penalty, 10+ ΔE = -30 penalty
  dfs -= Math.min(colorDeltaEAvg / 10, 1) * 30 * weights.color;

  // Size mismatch penalty (up to -15 points)
  // When dimensions differ and required padding/cropping (adjusted=true),
  // penalize based on relative area difference to reflect layout discrepancies.
  // This addresses cases where most pixels match but fundamental layout differs.
  if (result.dimensions.adjusted) {
    const figmaDim = result.dimensions.figma;
    const implDim = result.dimensions.impl;
    const areaFigma = figmaDim.width * figmaDim.height;
    const areaImpl = implDim.width * implDim.height;
    const areaGap = Math.abs(areaFigma - areaImpl) / Math.max(areaFigma, areaImpl); // 0..1
    // Apply up to 15 points penalty, scaled by area difference (20 max * 0.75 cap)
    const sizePenalty = Math.min(15, Math.round(areaGap * 20));
    dfs -= sizePenalty;
  }

  // High severity style diff penalty (-20 points)
  // Only applies when expectedSpec provided and high-severity diffs detected
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
  const summaryParts = [
    pass ? 'PASS' : 'FAIL',
    `DFS: ${dfs}`,
    `pixelDiffRatio: ${(result.pixelDiffRatio * 100).toFixed(2)}%`,
  ];

  // Show content-only ratio if available (more intuitive metric)
  if (result.pixelDiffRatioContent !== undefined) {
    summaryParts.push(`pixelDiffRatioContent: ${(result.pixelDiffRatioContent * 100).toFixed(2)}%`);
    summaryParts.push(`contentCoverage: ${((result.contentCoverage ?? 0) * 100).toFixed(1)}%`);
  }

  summaryParts.push(`colorDeltaEAvg: ${colorDeltaEAvg.toFixed(2)}`);
  summaryParts.push(
    `styleDiffs: ${styleDiffs.length} (high: ${styleDiffs.filter((d: { severity: string }) => d.severity === 'high').length})`
  );

  const summary = summaryParts.join(' | ');

  // Calculate Style Fidelity Score (SFS) if style diffs exist
  let styleSummary: CompareResult['report']['styleSummary'];
  if (styleDiffs.length > 0) {
    const { computeStyleSummary } = await import('../utils/style-score.js');
    styleSummary = computeStyleSummary(
      styleDiffs,
      {
        deltaE: tDe,
        spacing: Number(settings.comparison.toleranceSpacing),
        dimension: Number(settings.comparison.toleranceDimension),
        layoutGap: Number(settings.comparison.toleranceLayoutGap),
        radius: Number(settings.comparison.toleranceRadius),
        borderWidth: Number(settings.comparison.toleranceBorderWidth),
        shadowBlur: Number(settings.comparison.toleranceShadowBlur),
        shadowColorExtraDE: Number(settings.comparison.toleranceShadowColorExtraDE),
      },
      args.weights
    );
  }

  return {
    summary,
    report: {
      metrics: {
        pixelDiffRatio: result.pixelDiffRatio,
        pixelDiffRatioContent: result.pixelDiffRatioContent ?? undefined,
        contentCoverage: result.contentCoverage ?? undefined,
        contentPixels: result.contentPixels ?? undefined,
        colorDeltaEAvg,
        dfs,
      },
      dimensions: result.dimensions,
      styleDiffs,
      styleSummary,
      qualityGate: qualityGateResult, // Use the full V2 result
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
