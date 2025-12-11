#!/usr/bin/env node
/**
 * Official uiMatch CLI - compare command
 * Safe for commit and distribution with sanitized logging
 */

import { uiMatchCompare } from '#plugin/commands/compare';
import type { CompareArgs } from '#plugin/types/index';
import { relativizePath, sanitizeFigmaRef, sanitizeUrl } from '#plugin/utils/sanitize';
import { getQualityGateProfile } from '@uimatch/core';
import { silentLogger } from '@uimatch/shared-logging';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { getLogger, initLogger } from './logger.js';
import { errln, outln } from './print.js';

/**
 * Get logger safely: fallback to silentLogger if not initialized.
 * This prevents test failures when logger is accessed before initLogger() is called.
 */
function getOrSilentLogger(): typeof silentLogger {
  try {
    return getLogger();
  } catch {
    return silentLogger;
  }
}

export interface ParsedArgs {
  figma?: string;
  story?: string;
  selector?: string;
  subselector?: string;
  figmaChildStrategy?: string;
  viewport?: string;
  dpr?: string;
  figmaScale?: string;
  figmaAutoRoi?: string;
  maxChildren?: string;
  propsMode?: string;
  maxDepth?: string;
  detectStorybookIframe?: string;
  iframe?: string;
  size?: string;
  align?: string;
  padColor?: string;
  contentBasis?: string;
  emitArtifacts?: boolean;
  outDir?: string;
  timestampOutDir?: string;
  overlay?: string;
  jsonOnly?: string;
  verbose?: string;
  bootstrap?: string;
  expected?: string;
  saveExpected?: string;
  ignore?: string;
  weights?: string;
  format?: string;
  patchTarget?: string; // Deprecated: will be removed in next version
  profile?: string;
  showCqi?: string;
  showSuspicions?: string;
  showReEval?: string;
  selectors?: string;
  selectorsWriteBack?: string;
  selectorsPlugin?: string;
  // text check options
  text?: string;
  textMode?: string;
  textNormalize?: string;
  textCase?: string;
  textMatch?: string;
  textMinRatio?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  const toCamel = (s: string): string =>
    s.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;

    // key=value (existing format)
    const kv = a.match(/^(\w+)=([\s\S]+)$/);
    if (kv && kv[1] && kv[2]) {
      const key = kv[1] as keyof ParsedArgs;
      if (key === 'emitArtifacts') {
        const val = kv[2];
        out.emitArtifacts = val === 'true' ? true : val === 'false' ? false : undefined;
      } else {
        out[key] = kv[2] as never;
      }
      continue;
    }

    // --no-flag
    const nof = a.match(/^--no-([a-z][\w-]*)$/i);
    if (nof && nof[1]) {
      (out as Record<string, unknown>)[toCamel(nof[1])] = false;
      continue;
    }

    // --long=value
    const leq = a.match(/^--([a-z][\w-]*)=(.*)$/i);
    if (leq && leq[1] !== undefined && leq[2] !== undefined) {
      (out as Record<string, unknown>)[toCamel(leq[1])] = leq[2];
      continue;
    }

    // --long [value?]
    if (a.startsWith('--')) {
      const key = toCamel(a.slice(2));
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        (out as Record<string, unknown>)[key] = next;
        i++;
      } else {
        (out as Record<string, unknown>)[key] = true;
      }
      continue;
    }
  }

  // Backward compatibility: --emitArtifacts
  if (
    (out as Record<string, unknown>).emitArtifacts === undefined &&
    argv.includes('--emitArtifacts')
  ) {
    out.emitArtifacts = true;
  }

  return out;
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
 * Parse props mode string
 */
function parsePropsMode(value?: string): 'default' | 'extended' | 'all' | undefined {
  if (!value) return undefined;
  if (['default', 'extended', 'all'].includes(value)) {
    return value as 'default' | 'extended' | 'all';
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
  errln('Usage: uimatch compare figma=<FILE:NODE|URL> story=<URL> selector=<CSS> [options]');
  errln('');
  errln('Required:');
  errln('  figma=<value>           Figma file key and node ID (e.g., AbCdEf:1-23) or URL');
  errln('  story=<url>             Target URL to compare');
  errln('  selector=<css>          CSS selector for element to capture');
  errln('');
  errln('Optional:');
  errln('  subselector=<selector>  Child element inside selector for Figma child-node mapping');
  errln(
    '  figmaChildStrategy=<mode>  Child-node mapping strategy (area|area+position, default: area+position)'
  );
  errln('  selectors=<path>        Path to selector anchors JSON (LLM-managed)');
  errln('  selectorsWriteBack=<bool>  Write back resolved selectors to JSON (default: false)');
  errln(
    '  selectorsPlugin=<pkg>   Selector resolution plugin package (default: @uimatch/selector-anchors)'
  );
  errln('  maxChildren=<number>    Max child elements to analyze (default: 200)');
  errln(
    '  propsMode=<mode>        CSS properties to collect (default|extended|all, default: extended)'
  );
  errln('  maxDepth=<number>       Max depth to traverse for child elements (default: 6)');
  errln('  viewport=<WxH>          Viewport size (e.g., 1584x1104)');
  errln('  dpr=<number>            Device pixel ratio (default: 2)');
  errln('  figmaScale=<number>     Figma export scale factor (1-4, default: 2)');
  errln(
    '  figmaAutoRoi=<bool>     Auto-detect best matching child node (true/false, default: false)'
  );
  errln(
    '  detectStorybookIframe=<bool>  Use Storybook iframe (true/false, default: auto-detect from URL)'
  );
  errln('  size=<mode>             Size handling mode (strict|pad|crop|scale, default: strict)');
  errln(
    '  align=<mode>            Alignment for pad/crop (center|top-left|top|left, default: center)'
  );
  errln('  padColor=<color>        Padding color (auto|#RRGGBB, default: auto)');
  errln(
    '  contentBasis=<mode>     Content area basis (union|intersection|figma|impl, default: union)'
  );
  errln(
    '  emitArtifacts=<bool>    Include base64 artifacts in JSON output (true/false, default: false, auto-enabled by outDir)'
  );
  errln('  outDir=<path>           Save artifacts to directory (auto-enables emitArtifacts)');
  errln('  overlay=<bool>          Save overlay.png (impl + red highlights, default: false)');
  errln(
    '  jsonOnly=<bool>         Omit base64 artifacts from JSON (default: true when outDir set)'
  );
  errln('  verbose=<bool>          Show full URLs and paths (default: false)');
  errln('  bootstrap=<bool>        Derive expectedSpec from Figma node (default: true)');
  errln('  expected=<path>         Load expectedSpec JSON and use it for style diffs');
  errln('  saveExpected=<path>     If bootstrapped, save expectedSpec JSON to this path');
  errln('  ignore=<props>          CSV of CSS properties to exclude (e.g., background-color,gap)');
  errln('  weights=<json>          JSON weights for DFS (e.g., \'{"color":0.5,"spacing":1}\')');
  errln('  format=<type>           Output format (standard|claude, default: standard)');
  errln(
    '  profile=<name>          Quality gate profile (component/strict|component/dev|page-vs-component|page/text-doc|lenient|custom)'
  );
  errln('  showCqi=<bool>          Display Composite Quality Indicator (default: true)');
  errln('  showSuspicions=<bool>   Display suspicion warnings (default: true)');
  errln('  showReEval=<bool>       Display re-evaluation recommendations (default: true)');
  errln('');
  errln('Text Match (experimental):');
  errln('  text=<bool>             Enable text match (default: false)');
  errln('  textMode=<self|descendants>        Text collection scope (default: self)');
  errln('  textNormalize=<none|nfkc|nfkc_ws>  Normalization mode (default: nfkc_ws)');
  errln('  textCase=<sensitive|insensitive>   Case sensitivity (default: insensitive)');
  errln('  textMatch=<exact|contains|ratio>   Matching mode (default: ratio)');
  errln('  textMinRatio=<0..1>                Minimum similarity ratio (default: 0.98)');
  errln('');
  errln('Example:');
  errln(
    '  uimatch compare figma=AbCdEf:1-23 story=http://localhost:6006/iframe.html?id=button--default selector="#storybook-root" size=pad contentBasis=figma profile=component/strict outDir=./out'
  );
}

/**
 * Build CompareArgs configuration from parsed CLI arguments.
 * This function encapsulates the configuration building logic for testability.
 *
 * Key behaviors:
 * - outDir auto-enables emitArtifacts
 * - detectStorybookIframe auto-defaults based on URL pattern
 * - All optional parameters are conditionally added
 */
export function buildCompareConfig(args: ParsedArgs): CompareArgs {
  // Validate required parameters
  if (!args.figma) {
    throw new Error('Missing required parameter: figma');
  }
  if (!args.story) {
    throw new Error('Missing required parameter: story');
  }
  if (!args.selector) {
    throw new Error('Missing required parameter: selector');
  }

  const config: CompareArgs = {
    figma: args.figma,
    story: args.story,
    selector: args.selector,
    // Auto-enable emitArtifacts when outDir is specified
    emitArtifacts: Boolean(args.emitArtifacts || args.outDir),
    // Default to compact output (use --verbose for full details)
    verbose: parseBool(args.verbose) ?? false,
  };

  // Child selector for Figma child-node mapping
  if (args.subselector) {
    config.subselector = args.subselector;
  }

  // Child-node mapping strategy
  if (args.figmaChildStrategy && ['area', 'area+position'].includes(args.figmaChildStrategy)) {
    config.figmaChildStrategy = args.figmaChildStrategy as 'area' | 'area+position';
  }

  // Selector anchors JSON path
  if (args.selectors) {
    config.selectorsPath = args.selectors;
  }

  // Write back resolved selectors
  if (args.selectorsWriteBack) {
    config.selectorsWriteBack = parseBool(args.selectorsWriteBack) ?? false;
  }

  // Selector resolution plugin
  if (args.selectorsPlugin) {
    config.selectorsPlugin = args.selectorsPlugin;
  }

  if (args.maxChildren) {
    const maxChildren = parseInt(args.maxChildren, 10);
    if (!Number.isNaN(maxChildren)) config.maxChildren = maxChildren;
  }

  const propsMode = parsePropsMode(args.propsMode);
  if (propsMode) {
    config.propsMode = propsMode;
  } else {
    config.propsMode = 'extended';
  }

  if (args.maxDepth) {
    const maxDepth = parseInt(args.maxDepth, 10);
    if (!Number.isNaN(maxDepth)) config.maxDepth = maxDepth;
  }

  const viewport = parseViewport(args.viewport);
  if (viewport) config.viewport = viewport;

  if (args.dpr) {
    const dprValue = parseFloat(args.dpr);
    if (!Number.isNaN(dprValue)) config.dpr = dprValue;
  }

  if (args.figmaScale) {
    const figmaScaleValue = parseFloat(args.figmaScale);
    if (!Number.isNaN(figmaScaleValue)) config.figmaScale = figmaScaleValue;
  }

  const autoRoi = parseBool(args.figmaAutoRoi);
  if (autoRoi !== undefined) config.figmaAutoRoi = autoRoi;

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

  // Parse ignore list (comma-separated CSS properties)
  if (args.ignore) {
    config.ignore = String(args.ignore)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Parse weights (JSON format)
  if (args.weights) {
    try {
      config.weights = JSON.parse(String(args.weights)) as CompareArgs['weights'];
    } catch (e) {
      getOrSilentLogger().warn(`Failed to parse weights: ${(e as Error)?.message ?? String(e)}`);
    }
  }

  // Default to true for accurate DFS with style comparison
  // Without expectedSpec: styleDiffs=[], no style penalty (-20pts), DFS may be misleadingly high
  const bootstrap = parseBool(args.bootstrap) ?? true;
  config.bootstrapExpectedFromFigma = bootstrap;

  // Apply quality gate profile if specified
  if (args.profile) {
    try {
      const profile = getQualityGateProfile(args.profile);

      // Override thresholds from profile
      config.thresholds = {
        pixelDiffRatio: profile.thresholds.pixelDiffRatio,
        deltaE: profile.thresholds.deltaE,
      };

      // Override contentBasis if profile specifies it
      if (profile.contentBasis && !args.contentBasis) {
        config.contentBasis = profile.contentBasis;
      }

      // For pad mode profiles, enforce contentBasis if not explicitly set
      if (
        profile.contentBasis === 'intersection' &&
        config.sizeMode === 'pad' &&
        !args.contentBasis
      ) {
        config.contentBasis = 'intersection';
      }
    } catch (e) {
      getOrSilentLogger().warn(
        `Failed to load quality gate profile: ${(e as Error)?.message ?? String(e)}`
      );
    }
  }

  // Text match options
  if (
    (args.text ?? '').length > 0 ||
    args.textMode ||
    args.textNormalize ||
    args.textCase ||
    args.textMatch ||
    args.textMinRatio
  ) {
    const enabled = parseBool(args.text) ?? true;
    const mode =
      args.textMode === 'descendants' ? 'descendants' : ('self' as 'self' | 'descendants');
    const normalize = ((): 'none' | 'nfkc' | 'nfkc_ws' => {
      if (args.textNormalize === 'none') return 'none';
      if (args.textNormalize === 'nfkc') return 'nfkc';
      return 'nfkc_ws';
    })();
    const caseSensitive = args.textCase === 'sensitive';
    const match = ['exact', 'contains', 'ratio'].includes(args.textMatch ?? '')
      ? (args.textMatch as 'exact' | 'contains' | 'ratio')
      : 'ratio';
    const minRatio =
      Number.isFinite(Number(args.textMinRatio)) && Number(args.textMinRatio) >= 0
        ? Number(args.textMinRatio)
        : 0.98;
    config.textCheck = { enabled, mode, normalize, caseSensitive, match, minRatio };
  }

  return config;
}

export async function runCompare(argv: string[]): Promise<void> {
  // Lazy initialize logger for tests that call runCompare directly without going through CLI entry point
  try {
    getLogger();
  } catch {
    initLogger(argv); // respects --log-level / --log-format / --log-file flags if present
  }

  const args = parseArgs(argv);

  if (!args.figma || !args.story || !args.selector) {
    printUsage();
    process.exit(2);
  }

  try {
    // Build configuration using extracted function (this includes verbose decision)
    const config = buildCompareConfig(args);
    const saveExpectedPath = args.saveExpected;

    // Use config.verbose as the single source of truth
    const verbose = config.verbose;

    const logger = getLogger();

    // Load expectedSpec from file if provided.
    if (args.expected) {
      try {
        const text = await readFile(args.expected, 'utf-8');
        const parsed: unknown = JSON.parse(text);
        config.expectedSpec = parsed as Record<string, Record<string, string>>;
        logger.info({ path: args.expected }, 'Loaded expectedSpec from file');
      } catch (e) {
        logger.warn(
          { path: args.expected, error: (e as Error)?.message ?? String(e) },
          'Failed to read expectedSpec'
        );
      }
    }

    // Log sanitized inputs
    logger.info({ mode: config.sizeMode ?? 'strict' }, 'Execution mode');
    logger.info(
      {
        figma: verbose ? args.figma : sanitizeFigmaRef(args.figma),
      },
      'Figma reference'
    );
    logger.info({ story: verbose ? args.story : sanitizeUrl(args.story) }, 'Target URL');
    logger.info({ selector: args.selector }, 'Selector');

    const result = await uiMatchCompare(config);

    // Persist bootstrapped expectedSpec if requested
    if (config.bootstrapExpectedFromFigma && saveExpectedPath) {
      // The compare command doesn't return expectedSpec directly; reconstruct it
      // from quality report when possible. If unavailable, re-bootstrap here as a fallback.
      try {
        const { parseFigmaRef } = await import('../experimental/figma-mcp.js');
        const { FigmaRestClient } = await import('../adapters/figma-rest.js');
        const { buildExpectedSpecFromFigma } = await import('../expected/from-figma.js');

        const ref = parseFigmaRef(args.figma);
        if (ref !== 'current' && process.env.FIGMA_ACCESS_TOKEN) {
          const rest = new FigmaRestClient(process.env.FIGMA_ACCESS_TOKEN);
          const nodeJson = await rest.getNode({ fileKey: ref.fileKey, nodeId: ref.nodeId });
          const expected = buildExpectedSpecFromFigma(nodeJson, undefined);
          await writeFile(saveExpectedPath, JSON.stringify(expected, null, 2), 'utf-8');
          logger.info({ path: relativizePath(saveExpectedPath) }, 'expectedSpec saved');
        } else {
          logger.warn('Cannot save expectedSpec: missing FIGMA_ACCESS_TOKEN or "current" ref');
        }
      } catch (e) {
        logger.warn(`Failed to save expectedSpec: ${(e as Error)?.message ?? String(e)}`);
      }
    }

    // Save artifacts if outDir specified
    if (args.outDir) {
      if (!result.report.artifacts) {
        // This should never happen if emitArtifacts auto-enable worked correctly
        logger.warn(
          {
            possibleCauses: [
              'emitArtifacts was not auto-enabled (check config builder)',
              'Compare function did not generate artifacts despite emitArtifacts=true',
            ],
          },
          'outDir specified but artifacts missing in report'
        );
        logger.warn('Skipping artifact save to disk');
      } else {
        // Resolve outDir properly: if absolute, use as-is; if relative, resolve from cwd
        let outDir = isAbsolute(args.outDir) ? args.outDir : resolve(process.cwd(), args.outDir);

        // Add timestamp to avoid collisions if directory already exists
        // On CI, default to timestampOutDir=false for deterministic paths
        const isCI = process.env.CI === 'true';
        const timestampEnabled =
          args.timestampOutDir !== undefined ? (parseBool(args.timestampOutDir) ?? true) : !isCI;
        if (timestampEnabled && existsSync(outDir)) {
          const ts = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
          outDir = join(outDir, stamp);
        }

        await mkdir(outDir, { recursive: true });

        const { figmaPngB64, implPngB64, diffPngB64 } = result.report.artifacts;

        await writeFile(join(outDir, 'figma.png'), Buffer.from(figmaPngB64, 'base64'));
        await writeFile(join(outDir, 'impl.png'), Buffer.from(implPngB64, 'base64'));
        await writeFile(join(outDir, 'diff.png'), Buffer.from(diffPngB64, 'base64'));

        // Save overlay if requested
        const saveOverlay = parseBool(args.overlay) ?? false;
        if (saveOverlay) {
          // Generate overlay: impl.png with diff.png red highlights composited
          const { PNG } = await import('pngjs');
          const implBuf = Buffer.from(implPngB64, 'base64');
          const diffBuf = Buffer.from(diffPngB64, 'base64');
          const implPng = PNG.sync.read(implBuf);
          const diffPng = PNG.sync.read(diffBuf);

          // Composite red pixels from diff onto impl with semi-transparency
          for (let y = 0; y < implPng.height && y < diffPng.height; y++) {
            for (let x = 0; x < implPng.width && x < diffPng.width; x++) {
              const idx = (implPng.width * y + x) << 2;
              // pixelmatch uses red (R=255, G=0, B=0) for diff pixels
              if (
                diffPng.data[idx] === 255 &&
                diffPng.data[idx + 1] === 0 &&
                diffPng.data[idx + 2] === 0
              ) {
                // Apply semi-transparent red highlight
                implPng.data[idx] = 255; // R
                implPng.data[idx + 1] = 0; // G
                implPng.data[idx + 2] = 0; // B
                implPng.data[idx + 3] = 200; // A (semi-transparent)
              }
            }
          }

          const overlayBuf = PNG.sync.write(implPng);
          await writeFile(join(outDir, 'overlay.png'), overlayBuf);
        }

        // Save report (without base64 by default)
        const jsonOnly = parseBool(args.jsonOnly) ?? true;
        const reportToSave = jsonOnly ? { ...result.report, artifacts: undefined } : result.report;
        await writeFile(
          join(outDir, 'report.json'),
          JSON.stringify(reportToSave, null, 2),
          'utf-8'
        );

        // Save LLM-formatted output if requested
        if (args.format === 'claude') {
          const { formatForLLM, generateLLMPrompt } = await import(
            '../experimental/claude-formatter.js'
          );

          // Deprecation warning for patchTarget parameter
          if (args.patchTarget) {
            logger.warn(
              'patchTarget parameter is deprecated and will be removed. Output format is now CSS-only for maximum compatibility.'
            );
          }

          const llmPayload = formatForLLM(result, { preferTokens: true });

          await writeFile(
            join(outDir, 'claude.json'),
            JSON.stringify(llmPayload, null, 2),
            'utf-8'
          );
          await writeFile(
            join(outDir, 'claude-prompt.txt'),
            generateLLMPrompt(llmPayload),
            'utf-8'
          );
        }

        const relativeOut = relativizePath(outDir);
        outln(`✅ Artifacts saved → ${relativeOut}/`);
        outln('   - figma.png');
        outln('   - impl.png');
        outln('   - diff.png');
        if (saveOverlay) outln('   - overlay.png');
        outln('   - report.json');
        if (args.format === 'claude') {
          outln('   - claude.json');
          outln('   - claude-prompt.txt');
        }
        outln('');
      }
    }

    // Output format handling
    if (args.format === 'claude') {
      const { formatForLLM, generateLLMPrompt } = await import(
        '../experimental/claude-formatter.js'
      );

      // Deprecation warning for patchTarget parameter
      if (args.patchTarget) {
        logger.warn(
          'patchTarget parameter is deprecated and will be removed. Output format is now CSS-only for maximum compatibility.'
        );
      }

      const llmPayload = formatForLLM(result, { preferTokens: true });

      outln('');
      outln('=== LLM-Formatted Output ===');
      outln('');
      outln(generateLLMPrompt(llmPayload));
      outln('');
      process.exit(0);
    }

    // Standard output
    outln(result.summary);
    outln('');

    // Additional profile-based quality gate checks
    let profileGatePass = result.report.qualityGate?.pass ?? false;
    const additionalReasons: string[] = [];

    if (args.profile) {
      try {
        const profile = getQualityGateProfile(args.profile);

        // Check layout-specific high severity count
        const LAYOUT_KEYS = new Set([
          'display',
          'position',
          'flex-direction',
          'flex-wrap',
          'justify-content',
          'align-items',
          'align-content',
          'grid-template-columns',
          'grid-template-rows',
          'grid-auto-flow',
          'place-items',
          'place-content',
        ]);

        const layoutHighCount = result.report.styleDiffs.filter((d) => {
          return d.severity === 'high' && Object.keys(d.properties).some((k) => LAYOUT_KEYS.has(k));
        }).length;

        if (layoutHighCount > profile.thresholds.maxLayoutHighIssues) {
          profileGatePass = false;
          additionalReasons.push(
            `layoutHighCount ${layoutHighCount} > ${profile.thresholds.maxLayoutHighIssues}`
          );
        }

        // Check overall high severity count
        const highCount = result.report.styleSummary?.highCount ?? 0;
        if (highCount > profile.thresholds.maxHighSeverityIssues) {
          profileGatePass = false;
          additionalReasons.push(
            `highSeverityCount ${highCount} > ${profile.thresholds.maxHighSeverityIssues}`
          );
        }

        if (additionalReasons.length > 0) {
          outln(`Profile gate (${profile.name}): ❌ FAIL`);
          additionalReasons.forEach((r) => outln(`  - ${r}`));
        } else if (args.profile) {
          outln(`Profile gate (${profile.name}): ✅ PASS`);
        }
      } catch (e) {
        logger.warn(`Failed to evaluate profile gate: ${(e as Error)?.message ?? String(e)}`);
      }
    }

    if (verbose) {
      outln('Details:');
      outln(JSON.stringify(result.report, null, 2));
    } else {
      outln(`Gate: ${result.report.qualityGate?.pass ? '✅ PASS' : '❌ FAIL'}`);
      outln(`Pixel diff ratio: ${result.report.metrics.pixelDiffRatio.toFixed(4)}`);
      outln(`Color delta E (avg): ${result.report.metrics.colorDeltaEAvg.toFixed(2)}`);

      // === Quality gate metrics (optional display) ===
      const gate = result.report.qualityGate;
      const showCqi = parseBool(args.showCqi) !== false; // Default: true
      const showSuspicions = parseBool(args.showSuspicions) !== false; // Default: true
      const showReEval = parseBool(args.showReEval) !== false; // Default: true

      // Show CQI if available and enabled
      if (showCqi && gate?.cqi !== undefined) {
        const cqiEmoji = gate.cqi >= 90 ? '🟢' : gate.cqi >= 70 ? '🟡' : '🔴';
        outln(`CQI: ${cqiEmoji} ${gate.cqi}/100`);
      }

      // Show hard gate violations (always show if present)
      if (gate?.hardGateViolations && gate.hardGateViolations.length > 0) {
        outln('\n⚠️  Hard Gate Violations:');
        gate.hardGateViolations.forEach((v) => {
          const severityEmoji = v.severity === 'critical' ? '🚨' : '⚠️';
          outln(`  ${severityEmoji} [${v.type}] ${v.reason}`);
        });
      }

      // Show suspicions if enabled
      if (showSuspicions && gate?.suspicions?.detected) {
        outln('\n🔍 Suspicions Detected:');
        gate.suspicions.reasons.forEach((r) => {
          outln(`  • ${r}`);
        });
      }

      // Show re-evaluation recommendation if enabled
      if (showReEval && gate?.reEvaluated) {
        outln('\n💡 Re-evaluation Recommended:');
        outln('  Consider using contentBasis=intersection for more accurate metrics');
        if (gate.originalMetrics) {
          outln(
            `  Original: ${(gate.originalMetrics.pixelDiffRatioContent * 100).toFixed(2)}% (${gate.originalMetrics.contentBasis})`
          );
        }
      }

      // Show SFS if available
      if (result.report.styleSummary) {
        outln(`\nStyle Fidelity Score: ${result.report.styleSummary.styleFidelityScore}/100`);
        outln(
          `  Breakdown: ${result.report.styleSummary.highCount} high, ${result.report.styleSummary.mediumCount} medium, ${result.report.styleSummary.lowCount} low`
        );
        outln(
          `  Autofixable: ${result.report.styleSummary.autofixableCount}/${result.report.styleSummary.totalDiffs}`
        );
      }
    }

    // Use profile gate result if more restrictive than base gate
    const finalPass = (result.report.qualityGate?.pass ?? false) && profileGatePass;
    process.exit(finalPass ? 0 : 1);
  } catch (error) {
    errln('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
