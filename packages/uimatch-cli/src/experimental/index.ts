/**
 * Experimental APIs for uiMatch CLI.
 *
 * @experimental
 * These APIs are not stable and may change or be removed without notice.
 * Primarily intended for Claude Code / MCP integration experiments.
 */

export { formatForLLM, generateLLMPrompt } from './claude-formatter.js';
export type { ComponentDiff, LLMPayload, PatchConfidence, StyleIssue } from './claude-formatter.js';
export { FigmaMcpClient, parseFigmaRef } from './figma-mcp.js';
