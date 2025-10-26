/**
 * Configuration schemas with validation
 */

import { z } from 'zod';

/**
 * Capture configuration schema
 */
export const CaptureConfigSchema = z.object({
  /**
   * Default viewport width
   * @default 1440
   */
  defaultViewportWidth: z.number().int().positive().default(1440),

  /**
   * Default viewport height
   * @default 900
   */
  defaultViewportHeight: z.number().int().positive().default(900),

  /**
   * Default device pixel ratio
   * @default 2
   */
  defaultDpr: z.number().positive().default(2),

  /**
   * Default maximum child elements to collect styles from
   * @default 24
   */
  defaultMaxChildren: z.number().int().positive().default(24),

  /**
   * Default idle wait after networkidle (ms)
   * @default 150
   */
  defaultIdleWaitMs: z.number().int().nonnegative().default(150),

  /**
   * HTTP Basic Authentication username (from env)
   */
  basicAuthUser: z.string().optional(),

  /**
   * HTTP Basic Authentication password (from env)
   */
  basicAuthPass: z.string().optional(),
});

/**
 * Comparison configuration schema
 */
export const ComparisonConfigSchema = z.object({
  /**
   * Pixelmatch threshold (0 to 1). Smaller = more sensitive.
   * @default 0.1
   */
  pixelmatchThreshold: z.number().min(0).max(1).default(0.1),

  /**
   * Whether to skip anti-aliasing detection in pixelmatch
   * @default false
   */
  includeAA: z.boolean().default(false),

  /**
   * Color delta E threshold for style differences
   * @default 3.0
   */
  colorDeltaEThreshold: z.number().positive().default(3.0),

  /**
   * Acceptance threshold for pixelDiffRatio (quality gate)
   * @default 0.01
   */
  acceptancePixelDiffRatio: z.number().min(0).max(1).default(0.01),

  /**
   * Acceptance threshold for colorDeltaEAvg (quality gate)
   * @default 5.0
   */
  acceptanceColorDeltaE: z.number().positive().default(5.0),
});

/**
 * Full application configuration schema
 */
export const AppConfigSchema = z.object({
  capture: CaptureConfigSchema,
  comparison: ComparisonConfigSchema,
});

/**
 * Inferred TypeScript types from schemas
 */
export type CaptureConfig = z.infer<typeof CaptureConfigSchema>;
export type ComparisonConfig = z.infer<typeof ComparisonConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
