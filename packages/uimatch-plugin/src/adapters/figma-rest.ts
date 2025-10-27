import { setTimeout as delay } from 'node:timers/promises';

/**
 * Direct Figma REST API client for fetching PNG images without MCP dependency.
 * Requires a Figma Personal Access Token.
 */
export class FigmaRestClient {
  constructor(private token: string) {
    if (!this.token) throw new Error('FIGMA_ACCESS_TOKEN is required for Figma REST');
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const r = await fetch(url, { headers: { 'X-Figma-Token': this.token } });
    if (!r.ok) throw new Error(`Figma REST error: ${r.status} ${r.statusText}`);
    return (await r.json()) as T;
  }

  private async fetchBinary(url: string): Promise<Buffer> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Figma image fetch error: ${r.status} ${r.statusText}`);
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  }

  /**
   * Fetch PNG image for a specific frame.
   * @param params.fileKey - Figma file key
   * @param params.nodeId - Node ID within the file
   * @param params.scale - Export scale (1-4), default 2
   * @returns PNG image buffer
   */
  async getFramePng(params: { fileKey: string; nodeId: string; scale?: number }): Promise<Buffer> {
    // Clamp scale to Figma API limits (1-4)
    const scale = Math.max(1, Math.min(params.scale ?? 2, 4));
    const q = new URLSearchParams({
      ids: params.nodeId,
      format: 'png',
      scale: String(scale),
      use_absolute_bounds: 'true',
    });
    const meta = await this.fetchJson<{ images: Record<string, string> }>(
      `https://api.figma.com/v1/images/${params.fileKey}?${q.toString()}`
    );

    const url = meta.images?.[params.nodeId];
    if (!url) throw new Error('Figma REST did not return image URL');

    // Image URL may take a moment to generate; retry with exponential backoff
    let lastErr: unknown;
    for (let i = 0; i < 4; i++) {
      try {
        return await this.fetchBinary(url);
      } catch (e) {
        lastErr = e;
        await delay(200 * Math.pow(2, i));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
