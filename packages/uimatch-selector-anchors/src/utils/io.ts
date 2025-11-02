import type { SelectorsAnchors } from '#anchors/types/schema';
import { SelectorsAnchorsSchema } from '#anchors/types/schema';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Load selector anchors from JSON file
 *
 * @param path - Absolute or relative path to the anchors JSON file
 * @returns Parsed and validated anchors data
 * @throws Error if file doesn't exist, invalid JSON, or schema validation fails
 */
export async function loadSelectorsAnchors(path: string): Promise<SelectorsAnchors> {
  const absolutePath = resolve(path);

  try {
    const content = await readFile(absolutePath, 'utf-8');
    const json: unknown = JSON.parse(content);

    // Validate against schema
    const result = SelectorsAnchorsSchema.safeParse(json);

    if (!result.success) {
      throw new Error(`Invalid anchors JSON schema: ${result.error.message}`);
    }

    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON syntax in ${absolutePath}: ${error.message}`);
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Anchors file not found: ${absolutePath}`);
    }
    throw error;
  }
}

/**
 * Save selector anchors to JSON file
 *
 * @param path - Absolute or relative path to save the anchors JSON file
 * @param data - Anchors data to save
 * @throws Error if schema validation fails or write fails
 */
export async function saveSelectorsAnchors(path: string, data: SelectorsAnchors): Promise<void> {
  const absolutePath = resolve(path);

  // Validate data before saving
  const result = SelectorsAnchorsSchema.safeParse(data);

  if (!result.success) {
    throw new Error(`Cannot save invalid anchors data: ${result.error.message}`);
  }

  // Ensure directory exists
  const dir = dirname(absolutePath);
  await mkdir(dir, { recursive: true });

  // Write with formatting
  const json = JSON.stringify(result.data, null, 2);
  await writeFile(absolutePath, json, 'utf-8');
}

/**
 * Create an empty anchors JSON structure
 *
 * @returns Empty anchors with default version
 */
export function createEmptyAnchors(): SelectorsAnchors {
  return {
    version: '1.0.0',
    anchors: [],
  };
}

/**
 * Default postWrite implementation for CLI and standard usage
 * Can be used as context.postWrite hook in ResolveContext
 *
 * @param path - Path to anchors file
 * @param anchors - Updated anchors data
 */
export async function defaultPostWrite(path: string, anchors: object): Promise<void> {
  await saveSelectorsAnchors(path, anchors as SelectorsAnchors);
}
