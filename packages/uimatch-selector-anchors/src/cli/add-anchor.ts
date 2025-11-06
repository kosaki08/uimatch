#!/usr/bin/env node
/**
 * CLI tool for adding anchors to anchors.json
 * Usage: uimatch-anchors --file <file> --line <line> --column <column> --id <id> [--output <output>]
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  if (!options.file || !options.line || options.column === undefined || !options.id) {
    console.error('Error: Missing required arguments');
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
    const parsed = JSON.parse(content);
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
    console.error(`Error: File not found: ${absoluteFilePath}`);
    process.exit(1);
  }

  // Generate snippet hash
  console.log(`Generating snippet hash for ${file}:${line}:${column}...`);

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
    console.error(`Error: Anchor with ID "${id}" already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  // Create new anchor
  const newAnchor: SelectorAnchor = {
    id,
    source: {
      file: file, // Store relative path as provided
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
    console.log(`Updated anchor "${id}"`);
  } else {
    anchorsData.anchors.push(newAnchor);
    console.log(`Added anchor "${id}"`);
  }

  // Write back to file
  const content = JSON.stringify(anchorsData, null, 2);
  await writeFile(outputPath, content, 'utf-8');

  console.log(`Saved to ${outputPath}`);
  console.log(`Snippet hash: ${snippetResult.hash}`);
  console.log(`Snippet range: lines ${snippetResult.startLine}-${snippetResult.endLine}`);
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
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run main if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main();
}

export { addAnchor };
