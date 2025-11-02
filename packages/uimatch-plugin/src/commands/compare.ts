/**
 * UI comparison command
 */

import type { Probe, Resolution, SelectorResolverPlugin } from '@uimatch/selector-spi';
import type { CaptureResult, CompareImageResult } from 'uimatch-core';
import { browserPool, captureTarget, compareImages, resolveLocator } from 'uimatch-core';
import { computeDFS } from 'uimatch-scoring';
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
 * Result of selector resolution with plugin
 */
interface ResolveOutput {
  selector: string;
  subselector?: string;
  diagnostic?: Resolution;
}

/**
 * Attempt to resolve selector using dynamically loaded plugin.
 * Falls back to original selector if plugin is unavailable or fails.
 *
 * @param args - Comparison arguments
 * @returns Resolved selector information
 */
async function maybeResolveSelectorWithPlugin(args: CompareArgs): Promise<ResolveOutput> {
  // Determine plugin ID from CLI arg or environment variable
  // Only fall back to default if anchorsPath is explicitly provided
  const pluginId =
    args.selectorsPlugin ??
    process.env.UIMATCH_SELECTORS_PLUGIN?.trim() ??
    (args.selectorsPath ? '@uimatch/selector-anchors' : undefined);

  // Skip if no plugin specified
  if (!pluginId) {
    return { selector: args.selector };
  }

  // Attempt to dynamically import plugin
  let pluginModule: unknown;
  try {
    pluginModule = await import(pluginId);
  } catch {
    console.warn(`[uimatch] selector plugin "${pluginId}" not found. Skip.`);
    return { selector: args.selector };
  }

  // Create lightweight Playwright-based probe using BrowserPool context management
  const context = await browserPool.createContext({
    viewport: args.viewport,
    deviceScaleFactor: args.dpr ?? 2,
    httpCredentials: args.basicAuth,
  });
  const page = await context.newPage();

  try {
    // Navigate to target URL with timeout
    const timeout = Number(process.env.UIMATCH_NAV_TIMEOUT_MS ?? 6000);
    await page.goto(args.story, { waitUntil: 'domcontentloaded', timeout });

    // Detect Storybook iframe (/iframe.html takes precedence over mainFrame)
    // This ensures probe checks the same frame as captureTarget will use
    const frames = page.frames();
    const storybookFrame = frames.find((f) => /\/iframe\.html(\?|$)/.test(f.url()));
    const targetFrame = storybookFrame ?? page.mainFrame();

    // Create probe implementation
    const probe: Probe = {
      async check(selector, opts) {
        const startTime = performance.now();
        try {
          // Use resolveLocator to support role:/text:/testid: prefixes
          const locator = resolveLocator(targetFrame, selector).first();
          const visible = opts?.visible ?? true;
          await locator.waitFor({
            state: visible ? 'visible' : 'attached',
            timeout: opts?.timeoutMs ?? 600,
          });
          const isVisible = await locator.isVisible().catch(() => false);
          const result = isVisible || !visible;

          return {
            selector,
            isAlive: result, // Backward compatibility
            isValid: result,
            checkTime: performance.now() - startTime,
          };
        } catch (err) {
          return {
            selector,
            isAlive: false, // Backward compatibility
            isValid: false,
            checkTime: performance.now() - startTime,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };

    // Prepare context for plugin
    const resolveContext = {
      url: args.story,
      initialSelector: args.selector,
      anchorsPath: args.selectorsPath,
      writeBack: args.selectorsWriteBack ?? false,
      probe,
    };

    // Get plugin instance (handle both default and named exports)
    const plugin = (
      typeof pluginModule === 'object' && pluginModule !== null && 'default' in pluginModule
        ? (pluginModule as { default: unknown }).default
        : pluginModule
    ) as SelectorResolverPlugin;

    // Validate plugin interface before use
    if (!plugin || typeof plugin.resolve !== 'function') {
      console.warn(`[uimatch] selector plugin "${pluginId}" has no resolve(). Skip.`);
      return { selector: args.selector };
    }

    // Resolve selector using plugin
    const resolved = await plugin.resolve(resolveContext);

    // Handle write-back if plugin provided updated anchors
    if (resolved.updatedAnchors && args.selectorsPath) {
      try {
        // Generic JSON write-back (plugin-agnostic)
        const fs = await import('node:fs/promises');
        const updatedJson = JSON.stringify(resolved.updatedAnchors, null, 2);
        await fs.writeFile(args.selectorsPath, updatedJson, 'utf-8');
        console.log(`[uimatch] Updated anchors file: ${args.selectorsPath}`);
      } catch (err) {
        console.warn(
          `[uimatch] Failed to write back anchors: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return {
      selector: resolved.selector || args.selector,
      subselector: resolved.subselector,
      diagnostic: resolved,
    };
  } catch (err) {
    console.warn('[uimatch] selector plugin failed:', err instanceof Error ? err.message : err);
    return { selector: args.selector };
  } finally {
    await browserPool.closeContext(context);
  }
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

  // Selector resolution with dynamic plugin (Phase 1: safe NOP fallback)
  const resolved = await maybeResolveSelectorWithPlugin(args);
  args.selector = resolved.selector;
  if (resolved.subselector) {
    args.subselector = resolved.subselector;
  }

  // Browser DPR (for implementation capture) - no clamping needed
  const dpr = args.dpr ?? cfg.defaultDpr;

  // Figma scale (separate from browser DPR) - clamped to Figma API limits (1-4)
  const figmaScaleRaw = args.figmaScale ?? settings.capture.defaultFigmaScale;
  const figmaScale = Math.max(1, Math.min(figmaScaleRaw, 4));

  // Auto-ROI feature (detect best matching child node)
  const figmaAutoRoi = args.figmaAutoRoi ?? settings.capture.figmaAutoRoi;

  // Configure pixelmatch with settings fallback
  const pixelmatch = {
    threshold: args.pixelmatch?.threshold ?? settings.comparison.pixelmatchThreshold,
    includeAA: args.pixelmatch?.includeAA ?? settings.comparison.includeAA,
  };

  // === Smart Defaults for size handling ===
  // When pad mode is used (often for page vs component comparison), apply intelligent defaults:
  // - align: 'top-left' - reduces asymmetric padding noise
  // - contentBasis: 'intersection' - focuses on overlapping content area
  const effectiveSizeMode = args.sizeMode ?? 'strict';
  const effectiveAlign = args.align ?? (effectiveSizeMode === 'pad' ? 'top-left' : undefined);
  const effectiveContentBasis =
    args.contentBasis ?? (effectiveSizeMode === 'pad' ? 'intersection' : undefined);

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

    // Auto-ROI: Detect and use best matching child node if enabled
    // This will be triggered after implementation capture, so we defer it for now
    fileKey = fk;
    nodeId = nid;

    // Fetch PNG with figmaScale (separate from browser DPR)
    figmaPng = await rest.getFramePng({ fileKey: fk, nodeId: nid, scale: figmaScale });
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
    // Use figmaScale for MCP as well (separate from browser DPR)
    figmaPng = await figmaClient.getFramePng({ fileKey, nodeId, scale: figmaScale });
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
    childSelector: args.subselector,
    viewport: effectiveViewport,
    dpr,
    maxChildren: args.maxChildren ?? settings.capture.defaultMaxChildren,
    propsMode: args.propsMode,
    maxDepth: args.maxDepth ?? settings.capture.defaultMaxDepth,
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

  // 2.3) Figma child-node auto-selection (when subselector is provided)
  // Find best matching Figma child node based on DOM child box
  if (
    args.subselector &&
    cap.childBox &&
    process.env.FIGMA_ACCESS_TOKEN &&
    parsed &&
    parsed !== 'current'
  ) {
    try {
      const rest = new FigmaRestClient(process.env.FIGMA_ACCESS_TOKEN);
      const usePos = (args.figmaChildStrategy ?? 'area+position') === 'area+position';

      const pick = await rest.findBestChildForDomBox({
        fileKey,
        parentNodeId: nodeId,
        domChildAbs: cap.childBox,
        domRootAbs: cap.box,
        usePosition: usePos,
      });

      if (pick.nodeId) {
        console.log(
          `[uimatch] Child-node mapping: Found Figma child "${pick.debug?.picked}" (${pick.nodeId})`
        );
        nodeId = pick.nodeId;
        figmaPng = await rest.getFramePng({ fileKey, nodeId, scale: figmaScale });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[uimatch] Child-node mapping failed (continuing with parent): ${errMsg}`);
    }
  }

  // 2.4) Auto-ROI: Automatically detect and use best matching child node if enabled
  // Only works with REST API (requires FIGMA_ACCESS_TOKEN)
  type AutoRoiMeta = { applied: boolean; from?: string; to?: string };
  let roiMeta: AutoRoiMeta = { applied: false };

  if (
    figmaAutoRoi &&
    process.env.FIGMA_ACCESS_TOKEN &&
    fileKey !== 'env-bypass' &&
    nodeId !== 'env-bypass'
  ) {
    try {
      const rest = new FigmaRestClient(process.env.FIGMA_ACCESS_TOKEN);

      if (cap.box) {
        // Use actual captured element dimensions (not viewport)
        const targetWidth = cap.box.width;
        const targetHeight = cap.box.height;

        const originalNodeId = nodeId;
        const roiResult = await rest.autoDetectRoi({
          fileKey,
          nodeId,
          targetWidth,
          targetHeight,
        });

        if (roiResult.wasAdjusted) {
          console.log(
            `[uimatch] Auto-ROI enabled: Re-fetching Figma PNG for node ${roiResult.nodeId}`
          );
          nodeId = roiResult.nodeId;
          figmaPng = await rest.getFramePng({ fileKey, nodeId, scale: figmaScale });
          roiMeta = { applied: true, from: originalNodeId, to: nodeId };
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[uimatch] Auto-ROI failed (continuing with original node): ${errMsg}`);
    }
  }

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
  // Merge default ignoreProperties from settings with per-run ignore
  const defaultIgnore = settings.comparison?.ignoreProperties ?? [];
  const mergedIgnore = Array.from(new Set([...defaultIgnore, ...(args.ignore ?? [])]));

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
      ignore: mergedIgnore,
      weights: args.weights,
    },
    // Size handling options (with smart defaults applied)
    sizeMode: effectiveSizeMode,
    align: effectiveAlign,
    padColor: args.padColor,
    contentBasis: effectiveContentBasis,
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
    effectiveContentBasis ?? 'union'
  );

  const { pass } = qualityGateResult;

  // Calculate Design Fidelity Score (0-100) with optional weights
  const dfsResult = computeDFS({
    result,
    styleDiffs,
    weights: args.weights,
  });
  const dfs = dfsResult.score;

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

  // 5) Generate summary (always use styleSummary for consistency if available)
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

  // Use styleSummary counts for consistency with report.json
  if (styleSummary) {
    summaryParts.push(`styleDiffs: ${styleSummary.totalDiffs} (high: ${styleSummary.highCount})`);
  } else {
    // Fallback to styleDiffs array when styleSummary is not calculated
    summaryParts.push(
      `styleDiffs: ${styleDiffs.length} (high: ${styleDiffs.filter((d: { severity: string }) => d.severity === 'high').length})`
    );
  }

  const summary = summaryParts.join(' | ');

  // Build report with optional selector resolution info
  const report: CompareResult['report'] = {
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
    meta: {
      figmaAutoRoi: roiMeta,
    },
    artifacts: args.emitArtifacts
      ? {
          figmaPngB64: figmaPng.toString('base64'),
          implPngB64: cap.implPng.toString('base64'),
          diffPngB64: result.diffPngB64,
        }
      : undefined,
  };

  // Add selector resolution info if plugin was used
  if (resolved.diagnostic) {
    (report as typeof report & { selectorResolution?: unknown }).selectorResolution = {
      chosen: resolved.diagnostic.selector,
      subselector: resolved.diagnostic.subselector,
      stability: resolved.diagnostic.stabilityScore,
      reasons: resolved.diagnostic.reasons,
      plugin:
        process.env.UIMATCH_SELECTORS_PLUGIN || args.selectorsPlugin || '@uimatch/selector-anchors',
    };
  }

  return {
    summary,
    report,
  };
}
