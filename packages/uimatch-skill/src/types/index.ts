/**
 * Type definitions for uimatch-skill
 */

/**
 * Figma design variable (color, number, or string).
 */
export interface FigmaVariable {
  name: string;
  type: 'color' | 'number' | 'string';
  resolvedValue?: unknown;
  modes?: string[];
}

/**
 * Figma reference parsed from URL or shorthand format
 */
export interface FigmaRef {
  fileKey: string;
  nodeId: string;
}

/**
 * Acceptance thresholds for UI comparison.
 */
export interface Thresholds {
  /**
   * Maximum acceptable pixel difference ratio (0 to 1).
   */
  pixelDiffRatio?: number;

  /**
   * Maximum acceptable color Delta E (CIEDE2000).
   */
  deltaE?: number;
}

/**
 * UI comparison arguments
 */
export interface CompareArgs {
  /**
   * Figma reference (URL or `fileKey:nodeId`).
   */
  figma: string;

  /**
   * Target URL (Storybook or any web page).
   */
  story: string;

  /**
   * CSS selector for the component root.
   */
  selector: string;

  /**
   * Viewport dimensions.
   */
  viewport?: { width: number; height: number };

  /**
   * Device pixel ratio.
   * @default 1
   */
  dpr?: number;

  /**
   * Acceptance thresholds.
   */
  thresholds?: Thresholds;

  /**
   * Whether to include PNG artifacts in the report.
   */
  emitArtifacts?: boolean;

  /**
   * Font URLs to preload.
   */
  fontPreload?: string[];
}

/**
 * Comparison result
 */
export interface CompareResult {
  summary: string;
  report: {
    metrics: {
      pixelDiffRatio: number;
      colorDeltaEAvg: number;
      dfs: number;
    };
    styleDiffs: Array<{
      path: string;
      selector: string;
      properties: Record<string, { actual: string }>;
      severity: 'low' | 'medium' | 'high';
    }>;
    artifacts?: {
      figmaPngB64: string;
      implPngB64: string;
      diffPngB64: string;
    };
  };
}
