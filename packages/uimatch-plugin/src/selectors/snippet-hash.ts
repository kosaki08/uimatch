import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Configuration for snippet hash generation
 */
export interface SnippetHashOptions {
  /**
   * Number of lines before the target line to include in snippet
   * @default 3
   */
  contextBefore?: number;

  /**
   * Number of lines after the target line to include in snippet
   * @default 3
   */
  contextAfter?: number;

  /**
   * Hash algorithm to use
   * @default 'sha1'
   */
  algorithm?: 'sha1' | 'sha256' | 'md5';
}

/**
 * Result of snippet hash generation
 */
export interface SnippetHashResult {
  /**
   * Hash of the snippet (e.g., "sha1:7a2c...")
   */
  hash: string;

  /**
   * The actual snippet text that was hashed
   */
  snippet: string;

  /**
   * Start line number of the snippet (1-indexed)
   */
  startLine: number;

  /**
   * End line number of the snippet (1-indexed)
   */
  endLine: number;
}

/**
 * Generate a hash of code snippet surrounding a target location
 *
 * This is used to detect if code has moved (line number changed but content is same)
 *
 * @param file - Relative or absolute path to source file
 * @param line - Target line number (1-indexed)
 * @param options - Configuration options
 * @returns Snippet hash result
 * @throws Error if file doesn't exist or line number is invalid
 */
export async function generateSnippetHash(
  file: string,
  line: number,
  options: SnippetHashOptions = {}
): Promise<SnippetHashResult> {
  const { contextBefore = 3, contextAfter = 3, algorithm = 'sha1' } = options;

  const absolutePath = resolve(file);

  // Read file
  const content = await readFile(absolutePath, 'utf-8');
  const lines = content.split('\n');

  // Validate line number
  if (line < 1 || line > lines.length) {
    throw new Error(
      `Invalid line number ${line} (file has ${lines.length} lines): ${absolutePath}`
    );
  }

  // Calculate snippet range (1-indexed line numbers)
  const startLine = Math.max(1, line - contextBefore);
  const endLine = Math.min(lines.length, line + contextAfter);

  // Extract snippet (convert to 0-indexed for array access)
  const snippetLines = lines.slice(startLine - 1, endLine);
  const snippet = snippetLines.join('\n');

  // Generate hash
  const hash = createHash(algorithm).update(snippet, 'utf-8').digest('hex');
  const hashString = `${algorithm}:${hash.substring(0, 8)}`;

  return {
    hash: hashString,
    snippet,
    startLine,
    endLine,
  };
}

/**
 * Find the best matching location for a snippet in a file
 *
 * This is useful when code has moved but the snippet hash doesn't match exactly
 * due to minor changes.
 *
 * @param file - Path to source file
 * @param targetHash - Expected snippet hash
 * @param originalLine - Original line number where snippet was found
 * @param options - Configuration options
 * @returns New line number if found, or null if no good match
 */
export async function findSnippetMatch(
  file: string,
  targetHash: string,
  originalLine: number,
  options: SnippetHashOptions = {}
): Promise<number | null> {
  const absolutePath = resolve(file);
  const content = await readFile(absolutePath, 'utf-8');
  const lines = content.split('\n');

  // Extract algorithm and hash from target (e.g., "sha1:7a2c" -> ["sha1", "7a2c"])
  const [targetAlgorithm, targetHashValue] = targetHash.split(':') as [string, string];

  let bestMatch: { line: number; score: number } | null = null;

  // Search in expanding radius from original line
  const searchRadius = Math.max(50, lines.length);

  for (let offset = 0; offset <= searchRadius; offset++) {
    const candidates =
      offset === 0 ? [originalLine] : [originalLine - offset, originalLine + offset];

    for (const candidateLine of candidates) {
      if (candidateLine < 1 || candidateLine > lines.length) continue;

      try {
        const result = await generateSnippetHash(file, candidateLine, {
          ...options,
          algorithm: targetAlgorithm as 'sha1' | 'sha256' | 'md5',
        });

        // Extract hash value for comparison
        const [, candidateHashValue] = result.hash.split(':') as [string, string];

        // Calculate similarity (simple prefix matching)
        let matchingChars = 0;
        const minLength = Math.min(targetHashValue.length, candidateHashValue.length);
        for (let i = 0; i < minLength; i++) {
          if (targetHashValue[i] === candidateHashValue[i]) {
            matchingChars++;
          } else {
            break;
          }
        }

        const score = matchingChars / Math.max(targetHashValue.length, candidateHashValue.length);

        // Perfect match
        if (score === 1.0) {
          return candidateLine;
        }

        // Track best partial match (at least 50% matching)
        if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { line: candidateLine, score };
        }
      } catch {
        // Skip lines that cause errors
        continue;
      }
    }
  }

  // Return best match if it's good enough (>= 75% similarity)
  return bestMatch && bestMatch.score >= 0.75 ? bestMatch.line : null;
}
