#!/usr/bin/env bun
/**
 * CLI wrapper for uiMatch compare command
 * Usage: bun run uimatch:compare -- figma=<FILE:NODE|URL> story=<URL> selector=<CSS> [emitArtifacts]
 */

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.figma || !args.story || !args.selector) {
    console.error(
      'Usage: bun run uimatch:compare -- figma=<FILE:NODE|URL> story=<URL> selector=<CSS>'
    );
    console.error('');
    console.error('Options:');
    console.error('  figma=<value>     Figma file key and node ID (e.g., AbCdEf:1-23) or URL');
    console.error('  story=<url>       Target URL to compare');
    console.error('  selector=<css>    CSS selector for element to capture');
    console.error('  --emitArtifacts   Include base64 artifacts in output');
    console.error('');
    console.error('Example:');
    console.error(
      '  bun run uimatch:compare -- figma=AbCdEf:1-23 story=http://localhost:6006/?path=/story/button selector="#root button"'
    );
    process.exit(2);
  }

  try {
    const result = await uiMatchCompare({
      figma: String(args.figma),
      story: String(args.story),
      selector: String(args.selector),
      emitArtifacts: Boolean(args.emitArtifacts),
    });

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
