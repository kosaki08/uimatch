#!/usr/bin/env bun
/**
 * CLI wrapper for uiMatch compare command
 * Usage: bun run uimatch:compare -- figma=<FILE:NODE|URL> story=<URL> selector=<CSS> [emitArtifacts]
 */

// Load environment variables from .env file
import 'dotenv/config';

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
    console.error('  --emitArtifacts         Include base64 artifacts in output');
    console.error('');
    console.error('Example:');
    console.error(
      '  bun run uimatch:compare -- figma=AbCdEf:1-23 story=http://localhost:6006/iframe.html?id=components-button--default selector="#storybook-root" viewport=1584x1104 dpr=1'
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

    const result = await uiMatchCompare(config);

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
