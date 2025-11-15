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
 * Experimental Claude configuration schema.
 * @experimental These settings may change or be removed without notice.
 */
export const ExperimentalClaudeConfigSchema = z.object({
  /**
   * Output format for Claude reports
   * @default 'prompt'
   */
  format: z.enum(['prompt', 'json']).default('prompt'),

  /**
   * Include raw diff data in output
   * @default false
   */
  includeRawDiffs: z.boolean().default(false),
});

/**
 * Experimental MCP configuration schema.
 * @experimental These settings may change or be removed without notice.
 */
export const ExperimentalMcpConfigSchema = z.object({
  /**
   * Enable MCP integration
   * @default false
   */
  enabled: z.boolean().default(false),
});

/**
 * Experimental features configuration schema.
 * @experimental All experimental features may change or be removed without notice.
 */
export const ExperimentalConfigSchema = z.object({
  /**
   * Claude-specific experimental settings
   */
  claude: ExperimentalClaudeConfigSchema.optional(),

  /**
   * MCP-specific experimental settings
   */
  mcp: ExperimentalMcpConfigSchema.optional(),
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

  /**
   * Experimental features (unstable)
   * @experimental
   */
  experimental: ExperimentalConfigSchema.optional(),
});

/**
 * Inferred TypeScript types from schemas
 */
export type FigmaMcpConfig = z.infer<typeof FigmaMcpConfigSchema>;
export type ExperimentalClaudeConfig = z.infer<typeof ExperimentalClaudeConfigSchema>;
export type ExperimentalMcpConfig = z.infer<typeof ExperimentalMcpConfigSchema>;
export type ExperimentalConfig = z.infer<typeof ExperimentalConfigSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
