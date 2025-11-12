/**
 * Figma MCP adapter for fetching design data
 */

import type { FigmaMcpConfig } from '#plugin/config/index';
import type { FigmaRef, FigmaVariable } from '#plugin/types/index';
import { errorMessage, getStringProp, isObject } from '#plugin/utils/error';
import { z } from 'zod';

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
   * Fetches with timeout, exponential backoff with jitter, and retry on rate limits/server errors.
   * Timeout can be configured via UIMATCH_HTTP_TIMEOUT_MS (default: 20000ms).
   */
  private async retryFetch(url: string, init: RequestInit, tries = 4): Promise<Response> {
    let lastErr: unknown;
    const timeoutMs = Number(process.env.UIMATCH_HTTP_TIMEOUT_MS ?? 20000);

    for (let i = 0; i < tries; i++) {
      const ac = new AbortController();
      const timeoutId = setTimeout(() => ac.abort(), timeoutMs);

      try {
        const r = await fetch(url, { ...init, signal: ac.signal });
        clearTimeout(timeoutId);

        if (r.status === 429 || r.status >= 500) {
          // Exponential backoff with ±25% jitter to avoid thundering herd
          const base = 250 * Math.pow(2, i);
          const jitter = base * (0.75 + Math.random() * 0.5);
          const backoff = Math.min(jitter, 6000);
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }

        return r;
      } catch (e: unknown) {
        clearTimeout(timeoutId);
        lastErr = e;

        // Apply same backoff strategy on network errors/timeouts
        const base = 250 * Math.pow(2, i);
        const jitter = base * (0.75 + Math.random() * 0.5);
        const backoff = Math.min(jitter, 6000);
        await new Promise((res) => setTimeout(res, backoff));
      }
    }

    throw new Error(`Figma MCP fetch failed after ${tries} attempts: ${errorMessage(lastErr)}`);
  }

  /**
   * List available tool names (for handshake).
   */
  private async listTools(): Promise<string[]> {
    const url = `${this.config.mcpUrl.replace(/\/+$/, '')}/tools/list`;
    const res = await this.retryFetch(url, {
      method: 'GET',
      headers: {
        ...(this.config.mcpToken ? { authorization: `Bearer ${this.config.mcpToken}` } : {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Figma MCP error: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { tools?: Array<{ name: string }> };
    return (json.tools ?? []).map((t) => t.name);
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
   * Normalize various image responses to Buffer.
   */
  private toPngBuffer(out: unknown): Buffer {
    // Narrow unknown safely before member access
    const obj = isObject(out) ? out : {};
    const dataUrl = getStringProp(obj, 'dataUrl');
    const b64 =
      getStringProp(obj, 'pngB64') ??
      getStringProp(obj, 'imageB64') ??
      (dataUrl && dataUrl.startsWith('data:image/png;base64,')
        ? dataUrl.replace(/^data:image\/png;base64,/, '')
        : undefined);
    if (!b64) {
      throw new Error('Figma MCP: screenshot response did not contain base64 PNG');
    }
    return Buffer.from(b64, 'base64');
  }

  /**
   * Fetches a PNG screenshot of a Figma frame via MCP.
   * Supports multiple tool name variants via handshake.
   *
   * @param params - File key, node ID, and optional scale
   * @returns PNG buffer
   */
  async getFramePng(params: { fileKey: string; nodeId: string; scale?: number }): Promise<Buffer> {
    const tools = await this.listTools().catch(() => [] as string[]);

    // Prefer explicit frame_png if it exists, otherwise fallback to get_screenshot variants
    if (tools.includes('figma.get_frame_png')) {
      const pngResp = z.object({ pngB64: z.string() });
      const out = await this.callTool('figma.get_frame_png', params, pngResp);
      return Buffer.from(out.pngB64, 'base64');
    }

    const name = tools.find((t) => /get_?screenshot/i.test(t)) ?? 'figma.get_screenshot';
    // Many implementations accept fileKey/nodeId/scale. Unsupported implementations may return current selection.
    const anyResp = z.unknown();
    const out: unknown = await this.callTool(name, params, anyResp).catch(async () => {
      return this.callTool(name, {}, anyResp); // No args = current selection
    });
    return this.toPngBuffer(out);
  }

  /**
   * Resolve current selection -> {fileKey, nodeId} via available tool.
   */
  async getCurrentSelectionRef(): Promise<FigmaRef> {
    const tools = await this.listTools().catch(() => [] as string[]);

    if (tools.length === 0) {
      throw new Error(
        'Figma MCP: No tools available. Please check:\n' +
          '  1. Figma Desktop App is running\n' +
          '  2. MCP server is accessible\n' +
          `  3. FIGMA_MCP_URL is correct: ${this.config.mcpUrl}`
      );
    }

    const anyResp = z.unknown();

    // 1) get_selection系 → 2) get_design_context系
    const selName = tools.find((t) => /get_?selection/i.test(t));
    if (selName) {
      const out: unknown = await this.callTool(selName, {}, anyResp);
      const obj = out as Record<string, unknown>;
      const fileKey =
        (obj?.fileKey as string | undefined) ??
        ((obj?.selection as Record<string, unknown>)?.fileKey as string | undefined);
      const nodeId =
        (obj?.nodeId as string | undefined) ??
        ((obj?.selection as Record<string, unknown>)?.nodeId as string | undefined) ??
        ((obj?.selection as Record<string, unknown>)?.id as string | undefined);
      if (fileKey && nodeId) {
        return { fileKey, nodeId };
      }
    }

    const ctxName = tools.find((t) => /design.*context/i.test(t)) ?? 'figma.get_design_context';
    const ctx: unknown = await this.callTool(ctxName, {}, anyResp).catch(() => ({}));
    const ctxObj = ctx as Record<string, unknown>;
    const fileKey =
      (ctxObj?.fileKey as string | undefined) ??
      ((ctxObj?.document as Record<string, unknown>)?.fileKey as string | undefined);
    const nodeId =
      (ctxObj?.nodeId as string | undefined) ??
      ((ctxObj?.node as Record<string, unknown>)?.id as string | undefined) ??
      ((ctxObj?.selection as Array<Record<string, unknown>>)?.[0]?.id as string | undefined) ??
      undefined;
    if (fileKey && nodeId) {
      return { fileKey, nodeId };
    }

    throw new Error(
      'Figma MCP: Could not resolve current selection.\n' +
        'Please ensure:\n' +
        '  1. A node is selected in Figma Desktop App\n' +
        '  2. The node is in the current file (not a component from another file)\n' +
        '  3. The MCP server supports selection API\n' +
        `Available tools: ${tools.join(', ')}`
    );
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
 * Supports `'current'`, `fileKey:nodeId` format, or full Figma URL.
 *
 * @param ref - Figma reference string
 * @returns File key and node ID, or 'current' for current selection
 */

export function parseFigmaRef(ref: string): FigmaRef | 'current' {
  // Special case: 'current' means use current Figma selection
  if (ref === 'current') {
    return 'current';
  }

  // Support: "fileKey:nodeId" shorthand format
  if (ref.includes(':') && !ref.startsWith('http')) {
    const [fileKey, nodeId] = ref.split(':');
    if (!fileKey || !nodeId) throw new Error('Invalid figma ref "fileKey:nodeId"');
    return { fileKey, nodeId };
  }

  // Parse Figma URL - supports both /file/ and /design/ paths
  try {
    const u = new URL(ref);

    // Extract fileKey from pathname (supports /file/ and /design/)
    const pathMatch = u.pathname.match(/\/(file|design)\/([^/]+)/);
    const fileKey = pathMatch?.[2];

    // Try multiple node-id parameter variants
    const nodeId =
      u.searchParams.get('node-id') ??
      u.searchParams.get('node_id') ??
      u.searchParams.get('nodeId') ??
      undefined;

    if (!fileKey || !nodeId) {
      throw new Error('fileKey or node-id missing in Figma URL');
    }

    return { fileKey, nodeId: decodeURIComponent(nodeId) };
  } catch (e) {
    throw new Error(
      `Unsupported Figma reference. Use 'current', 'fileKey:nodeId', or full Figma URL: ${(e as Error).message}`
    );
  }
}
