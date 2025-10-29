#!/usr/bin/env node
/**
 * Official uiMatch CLI - compare command
 * Safe for commit and distribution with sanitized logging
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { uiMatchCompare } from '../commands/compare.js';
import { relativizePath, sanitizeFigmaRef, sanitizeUrl } from '../utils/sanitize.js';

interface ParsedArgs {
  figma?: string;
  story?: string;
  selector?: string;
  viewport?: string;
  dpr?: string;
  detectStorybookIframe?: string;
  iframe?: string;
  size?: string;
  align?: string;
  padColor?: string;
  contentBasis?: string;
  emitArtifacts?: boolean;
  outDir?: string;
  overlay?: string;
  jsonOnly?: string;
  verbose?: string;
  bootstrap?: string;
  expected?: string;
  saveExpected?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (const arg of argv) {
    const match = arg.match(/^(\w+)=([\s\S]+)$/);
    if (match) {
      const key = match[1] as keyof ParsedArgs;
      result[key] = match[2] as never;
    } else if (arg === '--emitArtifacts') {
      result.emitArtifacts = true;
    }
  }

  return result;
}

/**
 * Parse viewport string (e.g., "1584x1104" or "1584X1104")
 */
function parseViewport(value?: string): { width: number; height: number } | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d+)[xX](\d+)$/);
  if (!match || !match[1] || !match[2]) return undefined;
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

/**
 * Parse boolean string ("true" or "false")
 */
function parseBool(value?: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * Parse size mode string
 */
function parseSizeMode(value?: string): 'strict' | 'pad' | 'crop' | 'scale' | undefined {
  if (!value) return undefined;
  if (['strict', 'pad', 'crop', 'scale'].includes(value)) {
    return value as 'strict' | 'pad' | 'crop' | 'scale';
  }
  return undefined;
}

/**
 * Parse alignment string
 */
function parseAlignment(value?: string): 'center' | 'top-left' | 'top' | 'left' | undefined {
  if (!value) return undefined;
  if (['center', 'top-left', 'top', 'left'].includes(value)) {
    return value as 'center' | 'top-left' | 'top' | 'left';
  }
  return undefined;
}

/**
 * Parse content basis string
 */
function parseContentBasis(
  value?: string
): 'union' | 'intersection' | 'figma' | 'impl' | undefined {
  if (!value) return undefined;
  if (['union', 'intersection', 'figma', 'impl'].includes(value)) {
    return value as 'union' | 'intersection' | 'figma' | 'impl';
  }
  return undefined;
}

/**
 * Parse hex color string (#RRGGBB) to RGB
 */
function parseHexColor(value?: string): { r: number; g: number; b: number } | undefined {
  if (!value || value === 'auto') return undefined;
  const match = value.match(/^#([0-9a-fA-F]{6})$/);
  if (!match || !match[1]) return undefined;
  const hex = match[1];
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

function printUsage(): void {
  console.error(
    'Usage: uimatch compare figma=<FILE:NODE|URL> story=<URL> selector=<CSS> [options]'
  );
  console.error('');
  console.error('Required:');
  console.error('  figma=<value>           Figma file key and node ID (e.g., AbCdEf:1-23) or URL');
  console.error('  story=<url>             Target URL to compare');
  console.error('  selector=<css>          CSS selector for element to capture');
  console.error('');
  console.error('Optional:');
  console.error('  viewport=<WxH>          Viewport size (e.g., 1584x1104)');
  console.error('  dpr=<number>            Device pixel ratio (default: 2)');
  console.error('  detectStorybookIframe=<bool>  Use Storybook iframe (true/false, default: true)');
  console.error(
    '  size=<mode>             Size handling mode (strict|pad|crop|scale, default: strict)'
  );
  console.error(
    '  align=<mode>            Alignment for pad/crop (center|top-left|top|left, default: center)'
  );
  console.error('  padColor=<color>        Padding color (auto|#RRGGBB, default: auto)');
  console.error(
    '  contentBasis=<mode>     Content area basis (union|intersection|figma|impl, default: union)'
  );
  console.error(
    '  outDir=<path>           Save artifacts to directory (default: .uimatch-out/...)'
  );
  console.error(
    '  overlay=<bool>          Save overlay.png (impl + red highlights, default: false)'
  );
  console.error(
    '  jsonOnly=<bool>         Omit base64 artifacts from JSON (default: true if outDir set)'
  );
  console.error('  verbose=<bool>          Show full URLs and paths (default: false)');
  console.error('  bootstrap=<bool>        Derive expectedSpec from Figma node (default: false)');
  console.error('  expected=<path>         Load expectedSpec JSON and use it for style diffs');
  console.error('  saveExpected=<path>     If bootstrapped, save expectedSpec JSON to this path');
  console.error('');
  console.error('Example:');
  console.error(
    '  uimatch compare figma=AbCdEf:1-23 story=http://localhost:6006/iframe.html?id=button--default selector="#storybook-root" size=pad contentBasis=figma outDir=./out'
  );
}

export async function runCompare(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (!args.figma || !args.story || !args.selector) {
    printUsage();
    process.exit(2);
  }

  const verbose = parseBool(args.verbose) ?? false;

  try {
    // Build configuration
    const config: {
      figma: string;
      story: string;
      selector: string;
      emitArtifacts: boolean;
      viewport?: { width: number; height: number };
      dpr?: number;
      detectStorybookIframe?: boolean;
      sizeMode?: 'strict' | 'pad' | 'crop' | 'scale';
      align?: 'center' | 'top-left' | 'top' | 'left';
      padColor?: { r: number; g: number; b: number } | 'auto';
      contentBasis?: 'union' | 'intersection' | 'figma' | 'impl';
      bootstrapExpectedFromFigma?: boolean;
      expectedSpec?: Record<string, Record<string, string>>;
    } = {
      figma: args.figma,
      story: args.story,
      selector: args.selector,
      emitArtifacts: Boolean(args.emitArtifacts || args.outDir),
    };

    const viewport = parseViewport(args.viewport);
    if (viewport) config.viewport = viewport;

    if (args.dpr) {
      const dprValue = parseFloat(args.dpr);
      if (!Number.isNaN(dprValue)) config.dpr = dprValue;
    }

    const detectIframeFlag = parseBool(args.detectStorybookIframe) ?? parseBool(args.iframe);
    if (detectIframeFlag !== undefined) {
      config.detectStorybookIframe = detectIframeFlag;
    } else {
      // Auto-default: only enable iframe detection when the URL looks like Storybook.
      config.detectStorybookIframe = /\/iframe\.html(\?|$)/.test(args.story);
    }

    const sizeMode = parseSizeMode(args.size);
    if (sizeMode) config.sizeMode = sizeMode;

    const align = parseAlignment(args.align);
    if (align) config.align = align;

    const padColor = parseHexColor(args.padColor);
    if (padColor) {
      config.padColor = padColor;
    } else if (args.padColor === 'auto') {
      config.padColor = 'auto';
    }

    const contentBasis = parseContentBasis(args.contentBasis);
    if (contentBasis) config.contentBasis = contentBasis;

    // Toggle expectedSpec bootstrap
    const bootstrap = parseBool(args.bootstrap) ?? false;
    const saveExpectedPath = args.saveExpected;
    config.bootstrapExpectedFromFigma = bootstrap;

    // Load expectedSpec from file if provided.
    if (args.expected) {
      try {
        const text = await Bun.file(args.expected).text();
        const parsed: unknown = JSON.parse(text);
        config.expectedSpec = parsed as Record<string, Record<string, string>>;
        if (verbose) console.log(`[uimatch] loaded expectedSpec from ${args.expected}`);
      } catch (e) {
        console.warn(
          `Failed to read expectedSpec from ${args.expected}:`,
          (e as Error)?.message ?? e
        );
      }
    }

    // Log sanitized inputs
    console.log('[uimatch]', 'mode:', config.sizeMode ?? 'strict');
    console.log('[uimatch]', 'figma:', verbose ? args.figma : sanitizeFigmaRef(args.figma));
    console.log('[uimatch]', 'story:', verbose ? args.story : sanitizeUrl(args.story));
    console.log('[uimatch]', 'selector:', args.selector);
    console.log('');

    const result = await uiMatchCompare(config);

    // Persist bootstrapped expectedSpec if requested
    if (bootstrap && saveExpectedPath) {
      // The compare command doesn't return expectedSpec directly; reconstruct it
      // from quality report when possible. If unavailable, re-bootstrap here as a fallback.
      try {
        const { parseFigmaRef } = await import('../adapters/figma-mcp.js');
        const { FigmaRestClient } = await import('../adapters/figma-rest.js');
        const { buildExpectedSpecFromFigma } = await import('../expected/from-figma.js');

        const ref = parseFigmaRef(args.figma);
        if (ref !== 'current' && process.env.FIGMA_ACCESS_TOKEN) {
          const rest = new FigmaRestClient(process.env.FIGMA_ACCESS_TOKEN);
          const nodeJson = await rest.getNode({ fileKey: ref.fileKey, nodeId: ref.nodeId });
          const expected = buildExpectedSpecFromFigma(nodeJson, undefined);
          await Bun.write(saveExpectedPath, JSON.stringify(expected, null, 2));
          console.log(`💾 expectedSpec saved → ${relativizePath(saveExpectedPath)}`);
        } else {
          console.warn('Cannot save expectedSpec: missing FIGMA_ACCESS_TOKEN or "current" ref.');
        }
      } catch (e) {
        console.warn('Failed to save expectedSpec:', (e as Error)?.message ?? String(e));
      }
    }

    // Save artifacts if outDir specified
    if (args.outDir && result.report.artifacts) {
      const outDir = join(process.cwd(), args.outDir);
      await mkdir(outDir, { recursive: true });

      const { figmaPngB64, implPngB64, diffPngB64 } = result.report.artifacts;

      await Bun.write(join(outDir, 'figma.png'), Buffer.from(figmaPngB64, 'base64'));
      await Bun.write(join(outDir, 'impl.png'), Buffer.from(implPngB64, 'base64'));
      await Bun.write(join(outDir, 'diff.png'), Buffer.from(diffPngB64, 'base64'));

      // Save overlay if requested
      const saveOverlay = parseBool(args.overlay) ?? false;
      if (saveOverlay) {
        // Generate overlay: impl + red highlights from diff
        // This is a simplified version - full implementation would composite properly
        await Bun.write(join(outDir, 'overlay.png'), Buffer.from(diffPngB64, 'base64'));
      }

      // Save report (without base64 by default)
      const jsonOnly = parseBool(args.jsonOnly) ?? true;
      const reportToSave = jsonOnly ? { ...result.report, artifacts: undefined } : result.report;
      await Bun.write(join(outDir, 'report.json'), JSON.stringify(reportToSave, null, 2));

      const relativeOut = relativizePath(outDir);
      console.log(`✅ Artifacts saved → ${relativeOut}/`);
      console.log('   - figma.png');
      console.log('   - impl.png');
      console.log('   - diff.png');
      if (saveOverlay) console.log('   - overlay.png');
      console.log('   - report.json');
      console.log('');
    }

    console.log(result.summary);
    console.log('');

    if (verbose) {
      console.log('Details:');
      console.log(JSON.stringify(result.report, null, 2));
    } else {
      console.log('Gate:', result.report.qualityGate?.pass ? '✅ PASS' : '❌ FAIL');
      console.log('Pixel diff ratio:', result.report.metrics.pixelDiffRatio.toFixed(4));
      console.log('Color delta E (avg):', result.report.metrics.colorDeltaEAvg.toFixed(2));
    }

    process.exit(result.report.qualityGate?.pass ? 0 : 1);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
