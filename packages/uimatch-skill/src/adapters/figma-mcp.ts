/**
 * Figma MCP adapter for fetching design data
 */

import { z } from 'zod';
import type { FigmaMcpConfig } from '../config/index';
import type { FigmaRef, FigmaVariable } from '../types/index';

/**
 * MCP tool call structure.
 */
interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Figma MCP client for interacting with Figma via MCP server
 */
export class FigmaMcpClient {
  private readonly config: FigmaMcpConfig;

  constructor(config: FigmaMcpConfig) {
    this.config = config;
  }

  /**
   * Fetches with exponential backoff retry on rate limits and server errors.
   */
  private async retryFetch(url: string, init: RequestInit, tries = 4): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url, init);
        if (r.status === 429 || r.status >= 500) {
          const backoff = Math.min(1500 * Math.pow(2, i), 6000);
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }
        return r;
      } catch (e) {
        lastErr = e;
        const backoff = Math.min(1500 * Math.pow(2, i), 6000);
        await new Promise((res) => setTimeout(res, backoff));
      }
    }
    throw new Error(`Figma MCP fetch failed: ${(lastErr as Error)?.message ?? 'unknown'}`);
  }

  /**
   * Calls a Figma MCP tool and validates the response.
   */
  private async callTool<T>(
    name: string,
    args: Record<string, unknown>,
    schema: z.ZodType<T>
  ): Promise<T> {
    const url = `${this.config.mcpUrl.replace(/\/+$/, '')}/tools/call`;
    const res = await this.retryFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.config.mcpToken ? { authorization: `Bearer ${this.config.mcpToken}` } : {}),
      },
      body: JSON.stringify({ name, arguments: args } as ToolCall),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Figma MCP error: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`
      );
    }
    const json: unknown = await res.json();
    return schema.parse(json);
  }

  /**
   * Fetches a PNG screenshot of a Figma frame via MCP.
   *
   * @param params - File key, node ID, and optional scale
   * @returns PNG buffer
   */
  async getFramePng(params: { fileKey: string; nodeId: string; scale?: number }): Promise<Buffer> {
    const pngResp = z.object({ pngB64: z.string() });
    const out = await this.callTool('figma.get_frame_png', params, pngResp);
    return Buffer.from(out.pngB64, 'base64');
  }

  /**
   * Fetches Figma design variables from a file.
   *
   * @param params - File key and optional collection ID
   * @returns Array of Figma variables
   */
  async getVariables(params: { fileKey: string; collection?: string }): Promise<FigmaVariable[]> {
    const varsResp = z.object({
      variables: z.array(
        z.object({
          name: z.string(),
          type: z.enum(['color', 'number', 'string']),
          resolvedValue: z.unknown().optional(),
          modes: z.array(z.string()).optional(),
        })
      ),
    });
    const out = await this.callTool('figma.get_variables', params, varsResp);
    return out.variables;
  }
}

/**
 * Parses a Figma reference into file key and node ID.
 * Supports `fileKey:nodeId` format or full Figma URL.
 *
 * @param ref - Figma reference string
 * @returns File key and node ID
 */
export function parseFigmaRef(ref: string): FigmaRef {
  // Support: "fileKey:nodeId" or Figma URL
  if (ref.includes(':') && !ref.startsWith('http')) {
    const [fileKey, nodeId] = ref.split(':');
    if (!fileKey || !nodeId) throw new Error('Invalid figma ref "fileKey:nodeId"');
    return { fileKey, nodeId };
  }

  // Parse Figma URL using URL API for robustness
  try {
    const u = new URL(ref);
    const path = u.pathname; // /file/{fileKey}/...
    const fileKey = path.split('/file/')[1]?.split('/')[0];
    const nodeId =
      u.searchParams.get('node-id') ??
      u.searchParams.get('node_id') ??
      u.searchParams.get('nodeId');
    if (!fileKey || !nodeId) {
      throw new Error('fileKey or node-id missing in Figma URL');
    }
    return { fileKey, nodeId: decodeURIComponent(nodeId) };
  } catch (e) {
    throw new Error(
      `Unsupported Figma URL (expect .../file/{fileKey}?node-id=...): ${(e as Error).message}`
    );
  }
}
