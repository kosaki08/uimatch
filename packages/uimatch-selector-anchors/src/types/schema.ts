import { z } from 'zod';

/**
 * Source location schema for anchor points in code
 */
export const SourceLocationSchema = z.object({
  file: z.string().describe('Relative path from project root'),
  line: z.number().int().positive().describe('Line number (1-indexed)'),
  col: z.number().int().nonnegative().describe('Column number (0-indexed)'),
});

export type SourceLocation = z.infer<typeof SourceLocationSchema>;

/**
 * Selector hint schema for generating selectors
 */
export const SelectorHintSchema = z.object({
  prefer: z
    .array(z.enum(['testid', 'role', 'text', 'css']))
    .optional()
    .describe('Preferred selector strategies in order'),
  expectedText: z.string().optional().describe('Expected element text content'),
  testid: z.string().optional().describe('data-testid attribute value'),
  role: z.string().optional().describe('ARIA role'),
  ariaLabel: z.string().optional().describe('aria-label attribute value'),
});

export type SelectorHint = z.infer<typeof SelectorHintSchema>;

/**
 * Metadata schema for additional anchor information
 */
export const MetadataSchema = z.object({
  component: z.string().optional().describe('Component name'),
  description: z.string().optional().describe('Human-readable description'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
});

export type Metadata = z.infer<typeof MetadataSchema>;

/**
 * Snippet context schema - configuration for code snippet extraction
 */
export const SnippetContextSchema = z.object({
  contextBefore: z.number().int().nonnegative().default(3).describe('Lines before target line'),
  contextAfter: z.number().int().nonnegative().default(3).describe('Lines after target line'),
  algorithm: z
    .enum(['sha1', 'sha256', 'md5'])
    .default('sha1')
    .describe('Hash algorithm used for snippet'),
  hashDigits: z
    .number()
    .int()
    .min(6)
    .max(64)
    .default(10)
    .describe('Number of hex digits in hash (default 10 for collision resistance)'),
});

export type SnippetContext = z.infer<typeof SnippetContextSchema>;

/**
 * Fallbacks schema - additional strategies for selector resolution
 */
export const FallbacksSchema = z.object({
  text: z.string().optional().describe('Text content to use as fallback'),
  role: z.string().optional().describe('ARIA role to use as fallback'),
  classList: z.array(z.string()).optional().describe('CSS classes to use as fallback'),
  tag: z.string().optional().describe('HTML tag name to use as fallback'),
});

export type Fallbacks = z.infer<typeof FallbacksSchema>;

/**
 * Hints schema - additional hints extracted from source
 */
export const HintsSchema = z
  .object({
    tag: z.string().optional(),
    role: z.string().optional(),
    text: z.string().optional(),
    classList: z.array(z.string()).optional(),
  })
  .partial();

export type Hints = z.infer<typeof HintsSchema>;

/**
 * Selector anchor schema - represents a single anchor point
 */
export const SelectorAnchorSchema = z.object({
  id: z.string().describe('Unique identifier for this anchor'),
  source: SourceLocationSchema.describe('Source code location'),
  hint: SelectorHintSchema.optional().describe('Hints for selector generation'),
  hints: HintsSchema.optional().describe(
    'Additional hints extracted from source (tag, classList, aria, role, etc.)'
  ),
  lastKnown: z
    .object({
      selector: z.string(),
      stabilityScore: z.number().min(0).max(100).optional(),
      timestamp: z.string().datetime().optional(),
    })
    .optional()
    .describe('Last known good selector with optional stability and timestamp'),
  snippetHash: z.string().optional().describe('Hash of surrounding code snippet (±N lines)'),
  snippet: z.string().optional().describe('Original snippet text used to build the hash'),
  snippetContext: SnippetContextSchema.optional().describe('Snippet extraction configuration'),
  subselector: z
    .string()
    .optional()
    .describe('Optional subselector for Figma auto-ROI targeting child elements'),
  fallbacks: FallbacksSchema.optional().describe(
    'Fallback strategies (role/text) for selector resolution'
  ),
  resolvedCss: z
    .string()
    .nullable()
    .optional()
    .describe('Last resolved CSS selector (write-back cache)'),
  lastSeen: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .describe('Last time this selector was successfully resolved'),
  meta: MetadataSchema.optional().describe('Additional metadata'),
});

export type SelectorAnchor = z.infer<typeof SelectorAnchorSchema>;

/**
 * Root schema for the anchors JSON file
 */
export const SelectorsAnchorsSchema = z.object({
  version: z.string().default('1.0.0').describe('Schema version'),
  anchors: z.array(SelectorAnchorSchema).describe('Array of selector anchors'),
});

export type SelectorsAnchors = z.infer<typeof SelectorsAnchorsSchema>;

/**
 * Result of resolving a single anchor
 */
export const ResolvedAnchorSchema = z.object({
  id: z.string(),
  selector: z.string().nullable(),
  subselector: z.string().nullable().optional(),
  stabilityScore: z.number().min(0).max(100).optional(),
  reasons: z.array(z.string()).optional().describe('Explanation of selector selection'),
  error: z.string().optional().describe('Error message if resolution failed'),
});

export type ResolvedAnchor = z.infer<typeof ResolvedAnchorSchema>;
