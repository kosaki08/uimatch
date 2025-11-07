import { setTimeout as delay } from 'node:timers/promises';
import { getLoggerSafe } from '#plugin/cli/logger.js';

/**
 * Node metadata extracted from Figma REST API
 */
export interface FigmaNodeMetadata {
  id: string;
  type: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

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

    // Figma API may return image keys with either hyphens or colons
    // Try all variants to ensure we find the image URL
    const variants = new Set([
      params.nodeId,
      params.nodeId.replace(/:/g, '-'),
      params.nodeId.replace(/-/g, ':'),
    ]);

    let url: string | undefined;
    for (const k of variants) {
      url ||= meta.images?.[k];
    }
    if (!url) {
      throw new Error(
        `Figma REST did not return image URL for node ${params.nodeId}. ` +
          `Available keys: ${Object.keys(meta.images || {}).join(', ')}`
      );
    }

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

  /**
   * Fetch a Figma node JSON (document) for a given fileKey and nodeId.
   * Only a subset of fields will be used downstream.
   * @param params.fileKey - Figma file key
   * @param params.nodeId - Node ID within the file
   * @returns Node document object
   */
  async getNode(params: { fileKey: string; nodeId: string }): Promise<Record<string, unknown>> {
    const tryIds = new Set([
      params.nodeId,
      params.nodeId.replace(/:/g, '-'),
      params.nodeId.replace(/-/g, ':'),
    ]);
    let json: unknown;
    for (const id of tryIds) {
      const q = new URLSearchParams({ ids: id });
      const url = `https://api.figma.com/v1/files/${params.fileKey}/nodes?${q.toString()}`;
      try {
        json = await this.fetchJson<unknown>(url);
        const doc = (json as { nodes?: Record<string, { document?: unknown }> })?.nodes?.[id]
          ?.document;
        if (doc) return doc as Record<string, unknown>;
      } catch {
        // try next variant
      }
    }
    throw new Error(`Figma REST did not return node document for ${params.nodeId}`);
  }

  /**
   * Extract node metadata (bounding box) from Figma node document
   * @param node - Figma node document object
   * @returns Node metadata including dimensions and position
   */
  private extractNodeMetadata(node: Record<string, unknown>): FigmaNodeMetadata | null {
    const box = node.absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!box || box.width <= 0 || box.height <= 0) return null;

    // Safely extract string properties from node
    const id = typeof node.id === 'string' ? node.id : '';
    const type = typeof node.type === 'string' ? node.type : '';
    const name = typeof node.name === 'string' ? node.name : '';

    return {
      id,
      type,
      name,
      width: box.width,
      height: box.height,
      x: box.x,
      y: box.y,
    };
  }

  /**
   * Find best matching child node by comparing dimensions with target box
   * @param node - Parent Figma node document
   * @param targetWidth - Target implementation width
   * @param targetHeight - Target implementation height
   * @returns Best matching child metadata, or null if no suitable child found
   */
  private findBestMatchingChild(
    node: Record<string, unknown>,
    targetWidth: number,
    targetHeight: number
  ): FigmaNodeMetadata | null {
    const children = (node.children as Record<string, unknown>[]) ?? [];
    if (children.length === 0) return null;

    const targetArea = targetWidth * targetHeight;
    const targetAspect = targetWidth / targetHeight;

    let bestMatch: FigmaNodeMetadata | null = null;
    let bestScore = Infinity;

    for (const child of children) {
      const meta = this.extractNodeMetadata(child);
      if (!meta) continue;

      // Only consider FRAME, COMPONENT, or INSTANCE nodes
      if (!['FRAME', 'COMPONENT', 'INSTANCE'].includes(meta.type)) continue;

      const childArea = meta.width * meta.height;
      const childAspect = meta.width / meta.height;

      // Calculate similarity score (lower is better)
      const areaDiff = Math.abs(childArea - targetArea) / targetArea;
      const aspectDiff = Math.abs(childAspect - targetAspect) / targetAspect;

      // Weighted score: area difference (70%) + aspect difference (30%)
      const score = areaDiff * 0.7 + aspectDiff * 0.3;

      if (score < bestScore) {
        bestScore = score;
        bestMatch = meta;
      }
    }

    // Safety check: Only return if match is reasonable (within 50% area difference and 30% aspect difference)
    if (bestMatch && bestScore < 0.5) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Find best matching child by DOM child box (size + position)
   * @param parent - Parent node document
   * @param parentMeta - Parent node metadata
   * @param domChildRel - DOM child box normalized relative to root (0..1)
   * @param usePosition - Include position in matching score
   * @returns Best matching child metadata, or null if no suitable match found
   */
  private findChildByDomBox(
    parent: Record<string, unknown>,
    parentMeta: FigmaNodeMetadata,
    domChildRel: { w: number; h: number; cx: number; cy: number },
    usePosition: boolean
  ): FigmaNodeMetadata | null {
    const kids = (parent.children as Record<string, unknown>[]) ?? [];
    let best: FigmaNodeMetadata | null = null;
    let bestScore = Infinity;

    for (const k of kids) {
      const m = this.extractNodeMetadata(k);
      if (!m) continue;

      // Consider FRAME, COMPONENT, INSTANCE, TEXT, GROUP
      if (!['FRAME', 'COMPONENT', 'INSTANCE', 'TEXT', 'GROUP'].includes(m.type)) continue;

      // Normalize child relative to parent
      const wRel = m.width / parentMeta.width;
      const hRel = m.height / parentMeta.height;
      const cxRel = (m.x + m.width / 2 - parentMeta.x) / parentMeta.width;
      const cyRel = (m.y + m.height / 2 - parentMeta.y) / parentMeta.height;

      // Calculate differences
      const areaDiff = Math.abs(wRel * hRel - domChildRel.w * domChildRel.h);
      const aspectDiff = Math.abs(m.width / m.height - domChildRel.w / (domChildRel.h + 1e-6));
      const posDiff = usePosition ? Math.hypot(cxRel - domChildRel.cx, cyRel - domChildRel.cy) : 0;

      // Weighted score: area (70%) + aspect (20%) + position (10%)
      const score = areaDiff * 0.7 + Math.abs(aspectDiff) * 0.2 + posDiff * 0.1;

      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }

    return best;
  }

  /**
   * Find best child for DOM child box (subselector)
   * @param params.fileKey - Figma file key
   * @param params.parentNodeId - Parent node ID
   * @param params.domChildAbs - DOM child absolute box (page coordinates)
   * @param params.domRootAbs - DOM root absolute box (page coordinates)
   * @param params.usePosition - Include position in matching (default: true)
   * @returns Best matching child node ID, or null if not found
   */
  async findBestChildForDomBox(params: {
    fileKey: string;
    parentNodeId: string;
    domChildAbs: { x: number; y: number; width: number; height: number };
    domRootAbs: { x: number; y: number; width: number; height: number };
    usePosition?: boolean;
  }): Promise<{ nodeId: string | null; debug?: { picked?: string } }> {
    try {
      const parent = await this.getNode({ fileKey: params.fileKey, nodeId: params.parentNodeId });
      const parentMeta = this.extractNodeMetadata(parent);
      if (!parentMeta) return { nodeId: null };

      // Normalize DOM child relative to root
      const rel = {
        w: params.domChildAbs.width / params.domRootAbs.width,
        h: params.domChildAbs.height / params.domRootAbs.height,
        cx:
          (params.domChildAbs.x - params.domRootAbs.x + params.domChildAbs.width / 2) /
          params.domRootAbs.width,
        cy:
          (params.domChildAbs.y - params.domRootAbs.y + params.domChildAbs.height / 2) /
          params.domRootAbs.height,
      };

      const picked = this.findChildByDomBox(parent, parentMeta, rel, params.usePosition ?? true);
      return { nodeId: picked?.id ?? null, debug: { picked: picked?.name } };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      getLoggerSafe().warn(`[figma-child-node] Failed to find child: ${errMsg}`);
      return { nodeId: null };
    }
  }

  /**
   * Automatically detect and use best matching child node if parent is much larger than target
   * @param params.fileKey - Figma file key
   * @param params.nodeId - Parent node ID
   * @param params.targetWidth - Implementation capture width
   * @param params.targetHeight - Implementation capture height
   * @returns Best matching child node ID, or original nodeId if no better match found
   */
  async autoDetectRoi(params: {
    fileKey: string;
    nodeId: string;
    targetWidth: number;
    targetHeight: number;
  }): Promise<{ nodeId: string; wasAdjusted: boolean; originalNodeId: string }> {
    try {
      const node = await this.getNode({ fileKey: params.fileKey, nodeId: params.nodeId });
      const parentMeta = this.extractNodeMetadata(node);

      if (!parentMeta) {
        return { nodeId: params.nodeId, wasAdjusted: false, originalNodeId: params.nodeId };
      }

      const parentArea = parentMeta.width * parentMeta.height;
      const targetArea = params.targetWidth * params.targetHeight;

      // Only try auto-ROI if parent is significantly larger (>3x area)
      if (parentArea < targetArea * 3) {
        return { nodeId: params.nodeId, wasAdjusted: false, originalNodeId: params.nodeId };
      }

      const bestChild = this.findBestMatchingChild(node, params.targetWidth, params.targetHeight);

      if (bestChild) {
        getLoggerSafe().info(
          `[figma-auto-roi] Adjusted from ${parentMeta.name} (${parentMeta.width}x${parentMeta.height}) ` +
            `to child ${bestChild.name} (${bestChild.width}x${bestChild.height})`,
        );
        return { nodeId: bestChild.id, wasAdjusted: true, originalNodeId: params.nodeId };
      }

      return { nodeId: params.nodeId, wasAdjusted: false, originalNodeId: params.nodeId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      getLoggerSafe().warn(`[figma-auto-roi] Failed to auto-detect ROI: ${errMsg}`);
      return { nodeId: params.nodeId, wasAdjusted: false, originalNodeId: params.nodeId };
    }
  }
}
