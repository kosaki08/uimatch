#!/usr/bin/env bun
/**
 * CLI wrapper for uiMatch loop command
 * Usage: bun run uimatch:loop -- figma=<FILE:NODE|URL> story=<URL> selector=<CSS> [maxIters=5]
 */

// Load environment variables from .env file
import 'dotenv/config';

import { uiMatchLoop } from 'uimatch-plugin';

function parseArgs(argv: string[]): Record<string, string | boolean | number> {
  const result: Record<string, string | boolean | number> = {};

  for (const arg of argv) {
    const match = arg.match(/^(\w+)=([\s\S]+)$/);
    if (match) {
      const key = match[1];
      const value = match[2];

      // Parse numbers
      if (key === 'maxIters' || key === 'improvementThreshold') {
        result[key] = parseFloat(value);
      } else {
        result[key] = value;
      }
    } else if (arg === '--interactive') {
      result['interactive'] = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.figma || !args.story || !args.selector) {
    console.error(
      'Usage: bun run uimatch:loop -- figma=<FILE:NODE|URL> story=<URL> selector=<CSS> [maxIters=5]'
    );
    console.error('');
    console.error('Options:');
    console.error('  figma=<value>              Figma file key and node ID or URL');
    console.error('  story=<url>                Target URL to compare');
    console.error('  selector=<css>             CSS selector for element');
    console.error('  maxIters=<num>             Maximum iterations (default: 5)');
    console.error('  improvementThreshold=<n>   Stop if improvement < n (default: 0.5)');
    console.error('  --interactive              Wait for user input between iterations');
    console.error('');
    console.error('Example:');
    console.error(
      '  bun run uimatch:loop -- figma=AbCdEf:1-23 story=http://localhost:6006/?path=/story/button selector="#root button" maxIters=5'
    );
    process.exit(2);
  }

  try {
    const result = await uiMatchLoop({
      figma: String(args.figma),
      story: String(args.story),
      selector: String(args.selector),
      maxIters: typeof args.maxIters === 'number' ? args.maxIters : undefined,
      improvementThreshold:
        typeof args.improvementThreshold === 'number' ? args.improvementThreshold : undefined,
      interactive: Boolean(args.interactive),
    });

    console.log('');
    console.log('Final Summary:', result.summary);

    process.exit(result.report.passed ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
