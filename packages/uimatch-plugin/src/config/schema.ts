/**
 * Configuration schemas for uimatch-skill
 */

import { z } from 'zod';

/**
 * Figma MCP configuration schema
 */
export const FigmaMcpConfigSchema = z.object({
  /**
   * Figma MCP server URL
   */
  mcpUrl: z.string().url(),

  /**
   * Optional bearer token for MCP authentication
   */
  mcpToken: z.string().optional(),
});

/**
 * Skill configuration schema
 */
export const SkillConfigSchema = z.object({
  figmaMcp: FigmaMcpConfigSchema,

  /**
   * Default device pixel ratio
   * @default 2
   */
  defaultDpr: z.number().positive().default(2),

  /**
   * Default acceptance thresholds
   */
  defaultThresholds: z
    .object({
      pixelDiffRatio: z.number().min(0).max(1).default(0.01),
      deltaE: z.number().positive().default(5.0),
    })
    .default({ pixelDiffRatio: 0.01, deltaE: 5.0 }),
});

/**
 * Inferred TypeScript types from schemas
 */
export type FigmaMcpConfig = z.infer<typeof FigmaMcpConfigSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
