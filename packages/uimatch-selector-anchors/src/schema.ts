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
 * Last known selector state schema
 */
export const LastKnownSchema = z.object({
  selector: z.string().describe('Last known working selector'),
  timestamp: z.string().datetime().optional().describe('When this selector was last verified'),
  stabilityScore: z.number().min(0).max(100).optional().describe('Stability score (0-100)'),
});

export type LastKnown = z.infer<typeof LastKnownSchema>;

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
 * Selector anchor schema - represents a single anchor point
 */
export const SelectorAnchorSchema = z.object({
  id: z.string().describe('Unique identifier for this anchor'),
  source: SourceLocationSchema.describe('Source code location'),
  hint: SelectorHintSchema.optional().describe('Hints for selector generation'),
  snippetHash: z.string().optional().describe('Hash of surrounding code snippet (±3 lines)'),
  subselector: z
    .string()
    .optional()
    .describe('Optional subselector for Figma auto-ROI targeting child elements'),
  lastKnown: LastKnownSchema.optional().describe('Last known working selector'),
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
