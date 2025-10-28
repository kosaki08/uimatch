#!/usr/bin/env bun
/**
 * CLI wrapper for uiMatch compare command
 * Usage: bun run uimatch:compare -- figma=<FILE:NODE|URL> story=<URL> selector=<CSS> [emitArtifacts] [outDir=<path>]
 */

// Load environment variables from .env file
import 'dotenv/config';

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { uiMatchCompare } from 'uimatch-plugin';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};

  for (const arg of argv) {
    const match = arg.match(/^(\w+)=([\s\S]+)$/);
    if (match) {
      result[match[1]] = match[2];
    } else if (arg === '--emitArtifacts') {
      result['emitArtifacts'] = true;
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
  if (!match) return undefined;
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
 * Parse hex color string (#RRGGBB) to RGB
 */
function parseHexColor(value?: string): { r: number; g: number; b: number } | undefined {
  if (!value || value === 'auto') return undefined;
  const match = value.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return undefined;
  const hex = match[1];
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.figma || !args.story || !args.selector) {
    console.error(
      'Usage: bun run uimatch:compare -- figma=<FILE:NODE|URL> story=<URL> selector=<CSS> [options]'
    );
    console.error('');
    console.error('Required:');
    console.error(
      '  figma=<value>           Figma file key and node ID (e.g., AbCdEf:1-23) or URL'
    );
    console.error('  story=<url>             Target URL to compare');
    console.error('  selector=<css>          CSS selector for element to capture');
    console.error('');
    console.error('Optional:');
    console.error('  viewport=<WxH>          Viewport size (e.g., 1584x1104)');
    console.error('  dpr=<number>            Device pixel ratio (default: 2)');
    console.error(
      '  detectStorybookIframe=<bool>  Use Storybook iframe (true/false, default: true)'
    );
    console.error(
      '  size=<mode>             Size handling mode (strict|pad|crop|scale, default: strict)'
    );
    console.error(
      '  align=<mode>            Alignment for pad/crop (center|top-left|top|left, default: center)'
    );
    console.error('  padColor=<color>        Padding color (auto|#RRGGBB, default: auto)');
    console.error('  --emitArtifacts         Include base64 artifacts in output');
    console.error('  outDir=<path>           Save artifacts to directory (requires emitArtifacts)');
    console.error('');
    console.error('Example:');
    console.error(
      '  bun run uimatch:compare -- figma=AbCdEf:1-23 story=http://localhost:6006/iframe.html?id=components-button--default selector="#storybook-root" viewport=1584x1104 dpr=1 size=pad align=center'
    );
    process.exit(2);
  }

  try {
    // Build configuration with parsed arguments
    const config: any = {
      figma: String(args.figma),
      story: String(args.story),
      selector: String(args.selector),
      emitArtifacts: Boolean(args.emitArtifacts),
    };

    // Parse viewport if provided
    const viewport = parseViewport(args.viewport as string | undefined);
    if (viewport) {
      config.viewport = viewport;
    }

    // Parse dpr if provided
    if (args.dpr) {
      const dprValue = parseFloat(String(args.dpr));
      if (!Number.isNaN(dprValue)) {
        config.dpr = dprValue;
      }
    }

    // Parse detectStorybookIframe if provided (also support 'iframe' as alias)
    const detectIframe =
      parseBool(args.detectStorybookIframe as string | undefined) ??
      parseBool(args.iframe as string | undefined);
    if (detectIframe !== undefined) {
      config.detectStorybookIframe = detectIframe;
    }

    // Parse size mode if provided
    const sizeMode = parseSizeMode(args.size as string | undefined);
    if (sizeMode) {
      config.sizeMode = sizeMode;
    }

    // Parse alignment if provided
    const align = parseAlignment(args.align as string | undefined);
    if (align) {
      config.align = align;
    }

    // Parse pad color if provided
    const padColor = parseHexColor(args.padColor as string | undefined);
    if (padColor) {
      config.padColor = padColor;
    } else if (args.padColor === 'auto') {
      config.padColor = 'auto';
    }

    const result = await uiMatchCompare(config);

    // Save artifacts to disk if outDir is specified
    if (args.outDir && result.report.artifacts) {
      const outDir = String(args.outDir);
      await mkdir(outDir, { recursive: true });

      const { figmaPngB64, implPngB64, diffPngB64 } = result.report.artifacts;

      // Save PNG files using Bun.write
      await Bun.write(join(outDir, 'figma.png'), Buffer.from(figmaPngB64, 'base64'));
      await Bun.write(join(outDir, 'impl.png'), Buffer.from(implPngB64, 'base64'));
      await Bun.write(join(outDir, 'diff.png'), Buffer.from(diffPngB64, 'base64'));

      // Save report as JSON (without base64 to keep it readable)
      const reportWithoutArtifacts = { ...result.report, artifacts: undefined };
      await Bun.write(join(outDir, 'report.json'), JSON.stringify(reportWithoutArtifacts, null, 2));

      console.log(`✅ Artifacts saved to ${outDir}/`);
      console.log('   - figma.png');
      console.log('   - impl.png');
      console.log('   - diff.png');
      console.log('   - report.json');
      console.log('');
    }

    console.log(result.summary);
    console.log('');
    console.log('Details:');
    console.log(JSON.stringify(result.report, null, 2));

    process.exit(result.report.qualityGate?.pass ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
