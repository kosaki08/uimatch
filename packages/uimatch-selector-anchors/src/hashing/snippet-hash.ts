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

  /**
   * Timeout for snippet matching (milliseconds)
   * If specified, search will stop when time limit is reached
   * @default undefined (no timeout)
   */
  timeoutMs?: number;
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
  const lines = content.split(/\r?\n/);

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
 * Calculate text similarity between two strings using a hybrid approach
 * combining token overlap and character-level similarity
 * Returns a score between 0 and 1, where 1 is identical
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  if (text1 === text2) return 1.0;

  if (text1.length === 0 && text2.length === 0) return 1.0;
  if (text1.length === 0 || text2.length === 0) return 0.0;

  // Normalize whitespace for comparison
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  const norm1 = normalize(text1);
  const norm2 = normalize(text2);

  // 1. Calculate character-level similarity (weighted 40%)
  const len1 = norm1.length;
  const len2 = norm2.length;
  const minLen = Math.min(len1, len2);
  const maxLen = Math.max(len1, len2);

  let charMatches = 0;
  for (let i = 0; i < minLen; i++) {
    if (norm1[i] === norm2[i]) {
      charMatches++;
    }
  }
  const charScore = charMatches / maxLen;

  // 2. Calculate token-level similarity (weighted 80%)
  const tokenize = (text: string): string[] => {
    // Extract meaningful code tokens (identifiers, keywords)
    const tokens = text
      .toLowerCase()
      .split(/[\s\n\r\t,;.(){}[\]<>'"]+/)
      .filter((t) => t.length > 1 && /[a-z0-9_]/.test(t)); // Filter noise
    return tokens;
  };

  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  // Use multiset (bag) intersection for better matching
  // This counts how many tokens appear in both, even if duplicated
  const countMap1 = new Map<string, number>();
  const countMap2 = new Map<string, number>();

  for (const t of tokens1) {
    countMap1.set(t, (countMap1.get(t) || 0) + 1);
  }
  for (const t of tokens2) {
    countMap2.set(t, (countMap2.get(t) || 0) + 1);
  }

  // Count matching tokens (minimum count in both)
  let matches = 0;
  for (const [token, count1] of countMap1) {
    const count2 = countMap2.get(token) || 0;
    matches += Math.min(count1, count2);
  }

  const total = Math.max(tokens1.length, tokens2.length);
  const tokenScore = total > 0 ? matches / total : 0.0;

  // Combined score: 20% character similarity + 80% token similarity
  // Token-based matching works better for code that has moved or changed slightly
  return charScore * 0.2 + tokenScore * 0.8;
}

/**
 * Find the best matching location for a snippet in a file
 *
 * This is useful when code has moved but the snippet hash doesn't match exactly
 * due to minor changes.
 *
 * @param file - Path to source file
 * @param targetHashOrResult - Expected snippet hash string OR full SnippetHashResult with original snippet
 * @param originalLine - Original line number where snippet was found
 * @param options - Configuration options
 * @returns New line number if found, or null if no good match
 */
export async function findSnippetMatch(
  file: string,
  targetHashOrResult: string | SnippetHashResult,
  originalLine: number,
  options: SnippetHashOptions = {}
): Promise<number | null> {
  const absolutePath = resolve(file);
  const content = await readFile(absolutePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  // Extract hash and optional original snippet
  const targetHash =
    typeof targetHashOrResult === 'string' ? targetHashOrResult : targetHashOrResult.hash;
  const originalSnippet =
    typeof targetHashOrResult === 'object' ? targetHashOrResult.snippet : null;

  const [targetAlgorithm] = targetHash.split(':') as [string, string];

  let bestMatch: { line: number; score: number; snippet: string } | null = null;

  // Limit search radius for performance (configurable via environment variable)
  const searchRadius = Math.min(
    lines.length,
    Number(process.env.UIMATCH_SNIPPET_MAX_RADIUS ?? 400)
  );

  // Set up timeout deadline if specified
  const deadline = options.timeoutMs ? Date.now() + options.timeoutMs : null;

  // Create lightweight hash generator from already-loaded lines array
  const hashFromLines = (line: number) => {
    const { contextBefore = 3, contextAfter = 3 } = options;
    const startLine = Math.max(1, line - contextBefore);
    const endLine = Math.min(lines.length, line + contextAfter);
    const snippet = lines.slice(startLine - 1, endLine).join('\n');
    const hash = createHash(targetAlgorithm).update(snippet, 'utf-8').digest('hex');
    return { hash: `${targetAlgorithm}:${hash.substring(0, 8)}`, snippet };
  };

  for (let offset = 0; offset <= searchRadius; offset++) {
    // Check timeout before processing each offset
    if (deadline && Date.now() > deadline) {
      break;
    }

    const candidates =
      offset === 0 ? [originalLine] : [originalLine - offset, originalLine + offset];

    for (const candidateLine of candidates) {
      // Check timeout for each candidate
      if (deadline && Date.now() > deadline) {
        break;
      }
      if (candidateLine < 1 || candidateLine > lines.length) continue;

      try {
        const result = hashFromLines(candidateLine);

        // Check for exact hash match first
        if (result.hash === targetHash) {
          return candidateLine;
        }

        // For fuzzy matching, compare snippet text content (only if we have original snippet)
        if (originalSnippet !== null) {
          const score = calculateTextSimilarity(originalSnippet, result.snippet);

          // Track best partial match (at least 50% matching)
          // When scores are equal, prefer later line numbers (code moved down)
          if (score >= 0.5) {
            if (
              !bestMatch ||
              score > bestMatch.score + 1e-6 ||
              (Math.abs(score - bestMatch.score) <= 1e-6 && candidateLine > bestMatch.line)
            ) {
              bestMatch = { line: candidateLine, score, snippet: result.snippet };
            }
            // Early exit if we have a very high confidence match
            if (bestMatch.score >= 0.92) {
              return bestMatch.line;
            }
          }
        }
      } catch {
        // Skip lines that cause errors
        continue;
      }
    }
  }

  // Return best match if it's good enough (>= 60% similarity)
  // This threshold balances finding moved code vs avoiding false matches
  return bestMatch && bestMatch.score >= 0.6 ? bestMatch.line : null;
}
