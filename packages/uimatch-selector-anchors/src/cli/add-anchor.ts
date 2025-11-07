#!/usr/bin/env node
/**
 * CLI tool for adding anchors to anchors.json
 * Usage: uimatch-anchors --file <file> --line <line> --column <column> --id <id> [--output <output>]
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateSnippetHash } from '../hashing/snippet-hash.js';
import type { SelectorAnchor, SelectorsAnchors } from '../types/schema.js';
import { SelectorsAnchorsSchema } from '../types/schema.js';

interface AddAnchorOptions {
  file: string;
  line: number;
  column: number;
  id: string;
  output?: string;
  force?: boolean;
}

interface ParseResult {
  options?: AddAnchorOptions;
  isHelp?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): ParseResult {
  // Check for help first
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return { isHelp: true };
  }

  const options: Partial<AddAnchorOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--file':
        if (nextArg) options.file = nextArg;
        i++;
        break;
      case '--line':
        if (nextArg) options.line = Number.parseInt(nextArg, 10);
        i++;
        break;
      case '--column':
      case '--col':
        if (nextArg) options.column = Number.parseInt(nextArg, 10);
        i++;
        break;
      case '--id':
        if (nextArg) options.id = nextArg;
        i++;
        break;
      case '--output':
      case '-o':
        if (nextArg) options.output = nextArg;
        i++;
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
    }
  }

  // Validate required options
  const missing = [
    !options.file && '--file',
    !options.line && '--line',
    options.column === undefined && '--column',
    !options.id && '--id',
  ].filter(Boolean) as string[];

  if (missing.length) {
    process.stderr.write(`Error: Missing required arguments: ${missing.join(', ')}` + '\n');
    printUsage();
    return {};
  }

  // Validate numeric constraints
  const lineNum = options.line ?? 0;
  const colNum = options.column ?? 0;
  if (lineNum < 1 || colNum < 0) {
    process.stderr.write('Error: --line must be >= 1 and --column must be >= 0' + '\n');
    printUsage();
    return {};
  }

  return { options: options as AddAnchorOptions };
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Usage: uimatch-anchors [options]

Add a new anchor to anchors.json based on source code location

Options:
  --file <path>       Source file path (relative or absolute)
  --line <number>     Line number (1-indexed)
  --column <number>   Column number (0-indexed)
  --id <string>       Unique identifier for this anchor
  --output <path>     Output file path (default: ./anchors.json)
  --force, -f         Overwrite existing anchor with same ID
  --help, -h          Show this help message

Examples:
  # Add a new anchor
  uimatch-anchors --file src/Button.tsx --line 10 --column 2 --id button-root

  # Overwrite existing anchor
  uimatch-anchors --file src/Button.tsx --line 10 --column 2 --id button-root --force

  # Specify custom output file
  uimatch-anchors --file src/Button.tsx --line 10 --column 2 --id button-root --output custom.json
  `);
}

/**
 * Load existing anchors file or create new one
 */
async function loadOrCreateAnchors(outputPath: string): Promise<SelectorsAnchors> {
  try {
    const content = await readFile(outputPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    return SelectorsAnchorsSchema.parse(parsed);
  } catch {
    // File doesn't exist or invalid, return empty anchors
    return {
      version: '1.0.0',
      anchors: [],
    };
  }
}

/**
 * Add or update an anchor
 */
async function addAnchor(options: AddAnchorOptions): Promise<void> {
  const { file, line, column, id, output = './anchors.json', force = false } = options;

  // Resolve file path
  const absoluteFilePath = resolve(file);

  // Check if file exists
  try {
    await stat(absoluteFilePath);
  } catch {
    process.stderr.write(`Error: File not found: ${absoluteFilePath}` + '\n');
    process.exit(1);
  }

  // Generate snippet hash
  process.stdout.write(`Generating snippet hash for ${file}:${line}:${column}...` + '\n');

  let snippetResult;
  try {
    snippetResult = await generateSnippetHash(absoluteFilePath, line, {
      contextBefore: 3,
      contextAfter: 3,
      algorithm: 'sha1',
      hashDigits: 10,
    });
  } catch (error) {
    console.error(
      `Error generating snippet hash: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }

  // Load existing anchors
  const outputPath = resolve(output);
  const anchorsData = await loadOrCreateAnchors(outputPath);

  // Check if ID already exists
  const existingIndex = anchorsData.anchors.findIndex((a) => a.id === id);

  if (existingIndex >= 0 && !force) {
    process.stderr.write(
      `Error: Anchor with ID "${id}" already exists. Use --force to overwrite.` + '\n'
    );
    process.exit(1);
  }

  // Normalize path: store path relative to anchors.json directory
  const storedPath = relative(dirname(outputPath), absoluteFilePath) || file;

  // Create new anchor
  const newAnchor: SelectorAnchor = {
    id,
    source: {
      file: storedPath,
      line,
      col: column,
    },
    snippetHash: snippetResult.hash,
    snippet: snippetResult.snippet,
    snippetContext: {
      contextBefore: 3,
      contextAfter: 3,
      algorithm: 'sha1',
      hashDigits: 10,
    },
    resolvedCss: null,
    lastSeen: null,
  };

  // Add or update anchor
  if (existingIndex >= 0) {
    anchorsData.anchors[existingIndex] = newAnchor;
    process.stdout.write(`Updated anchor "${id}"` + '\n');
  } else {
    anchorsData.anchors.push(newAnchor);
    process.stdout.write(`Added anchor "${id}"` + '\n');
  }

  // Write back to file
  const content = JSON.stringify(anchorsData, null, 2);
  await writeFile(outputPath, content, 'utf-8');

  process.stdout.write(`Saved to ${outputPath}` + '\n');
  process.stdout.write(`Snippet hash: ${snippetResult.hash}` + '\n');
  process.stdout.write(
    `Snippet range: lines ${snippetResult.startLine}-${snippetResult.endLine}` + '\n'
  );
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const result = parseArgs(args);

  // Exit with 0 for help
  if (result.isHelp) {
    process.exit(0);
  }

  // Exit with 1 for parse errors
  if (!result.options) {
    process.exit(1);
  }

  try {
    await addAnchor(result.options);
  } catch (error) {
    process.stderr.write(
      `Fatal error: ${error instanceof Error ? error.message : String(error)}` + '\n'
    );
    process.exit(1);
  }
}

// Run main if executed directly
const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
  void main();
}

export { addAnchor };
