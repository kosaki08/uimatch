/**
 * Configuration loader from environment variables
 */

import { FigmaMcpConfigSchema, type FigmaMcpConfig, type SkillConfig } from './schema';

/**
 * Load Figma MCP configuration from environment variables.
 *
 * Environment variables:
 * - FIGMA_MCP_URL: Figma MCP server URL (required)
 * - FIGMA_MCP_TOKEN: Optional bearer token for authentication
 *
 * @param env - Environment variables object (defaults to process.env)
 * @returns Validated Figma MCP configuration
 * @throws If FIGMA_MCP_URL is missing or invalid
 */
export function loadFigmaMcpConfig(
  env: Record<string, string | undefined> = process.env
): FigmaMcpConfig {
  const mcpUrl = env.FIGMA_MCP_URL;
  if (!mcpUrl) {
    throw new Error('FIGMA_MCP_URL environment variable is required for Figma MCP');
  }

  return FigmaMcpConfigSchema.parse({
    mcpUrl,
    mcpToken: env.FIGMA_MCP_TOKEN,
  });
}

/**
 * Load full skill configuration from environment variables.
 *
 * @param env - Environment variables object (defaults to process.env)
 * @returns Complete skill configuration
 */
export function loadSkillConfig(
  env: Record<string, string | undefined> = process.env
): SkillConfig {
  return {
    figmaMcp: loadFigmaMcpConfig(env),
    defaultDpr: 1,
    defaultThresholds: {
      pixelDiffRatio: 0.01,
      deltaE: 5.0,
    },
  };
}
