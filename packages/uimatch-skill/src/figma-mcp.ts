import { z } from 'zod';

const BASE = process.env.FIGMA_MCP_URL;
const TOKEN = process.env.FIGMA_MCP_TOKEN;
if (!BASE) throw new Error('FIGMA_MCP_URL is required for Figma MCP');

/**
 * MCP tool call structure.
 */
type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

/**
 * Fetches with exponential backoff retry on rate limits and server errors.
 *
 * @param url - Target URL
 * @param init - Fetch options
 * @param tries - Max retry attempts
 * @returns Response object
 */
async function retryFetch(url: string, init: RequestInit, tries = 4): Promise<Response> {
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
 *
 * @param name - Tool name
 * @param args - Tool arguments
 * @param schema - Zod schema for response validation
 * @returns Parsed and validated response
 */
async function callTool<T>(
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>
): Promise<T> {
  const url = `${BASE!.replace(/\/+$/, '')}/tools/call`;
  const res = await retryFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({ name, arguments: args } as ToolCall),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Figma MCP error: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`
    );
  }
  const json = await res.json();
  return schema.parse(json);
}

const pngResp = z.object({ pngB64: z.string() });

/**
 * Fetches a PNG screenshot of a Figma frame via MCP.
 *
 * @param params - File key, node ID, and optional scale
 * @returns PNG buffer
 */
export async function getFramePng(params: { fileKey: string; nodeId: string; scale?: number }) {
  const out = await callTool('figma.get_frame_png', params, pngResp);
  return Buffer.from(out.pngB64, 'base64');
}

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

/**
 * Figma design variable (color, number, or string).
 */
export type FigmaVariable = z.infer<typeof varsResp>['variables'][number];

/**
 * Fetches Figma design variables from a file.
 *
 * @param params - File key and optional collection ID
 * @returns Array of Figma variables
 */
export async function getVariables(params: { fileKey: string; collection?: string }) {
  const out = await callTool('figma.get_variables', params, varsResp);
  return out.variables;
}

/**
 * Parses a Figma reference into file key and node ID.
 * Supports `fileKey:nodeId` format or full Figma URL.
 *
 * @param ref - Figma reference string
 * @returns File key and node ID
 */
export function parseFigmaRef(ref: string): { fileKey: string; nodeId: string } {
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
