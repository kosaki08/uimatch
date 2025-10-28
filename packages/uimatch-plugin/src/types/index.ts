/**
 * Type definitions for uimatch-plugin
 */

import type { ExpectedSpec, StyleDiff, TokenMap } from 'uimatch-core';

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
   * @default 3.0
   */
  deltaE?: number;

  /**
   * Tolerance ratio for spacing properties (padding, margin).
   * @default 0.15 (15%)
   */
  spacing?: number;

  /**
   * Tolerance ratio for dimension properties (width, height).
   * @default 0.05 (5%)
   */
  dimension?: number;

  /**
   * Tolerance ratio for gap properties (gap, column-gap, row-gap).
   * @default 0.1 (10%)
   */
  layoutGap?: number;

  /**
   * Tolerance ratio for border-radius.
   * @default 0.12 (12%)
   */
  radius?: number;

  /**
   * Tolerance ratio for border-width.
   * @default 0.3 (30%)
   */
  borderWidth?: number;

  /**
   * Tolerance ratio for box-shadow blur.
   * @default 0.15 (15%)
   */
  shadowBlur?: number;

  /**
   * Extra Delta E tolerance for box-shadow color comparison.
   * @default 1.0
   */
  shadowColorExtraDE?: number;
}

/**
 * UI comparison arguments
 */
export interface CompareArgs {
  /**
   * Figma reference (URL, `fileKey:nodeId`, or `'current'` for selected node).
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
   * @default 2
   */
  dpr?: number;

  /**
   * Whether to detect and use Storybook iframe for capture.
   * When true, automatically switches to iframe content if Storybook URL is detected.
   * @default true
   */
  detectStorybookIframe?: boolean;

  /**
   * Acceptance thresholds.
   */
  thresholds?: Thresholds;

  /**
   * pixelmatch sensitivity configuration (how visual differences are handled).
   */
  pixelmatch?: {
    /**
     * Matching threshold (0 to 1). Smaller values make the comparison more sensitive.
     * @default 0.1
     */
    threshold?: number;
    /**
     * Whether to include anti-aliasing in the comparison.
     * @default false
     */
    includeAA?: boolean;
  };

  /**
   * Whether to include PNG artifacts in the report.
   */
  emitArtifacts?: boolean;

  /**
   * Font URLs to preload.
   */
  fontPreload?: string[];

  /**
   * Basic authentication credentials for the target URL.
   */
  basicAuth?: {
    username: string;
    password: string;
  };

  /**
   * Expected style specification for comparison.
   * Maps selectors to expected CSS properties.
   */
  expectedSpec?: ExpectedSpec;

  /**
   * Design token mappings (CSS variables to values).
   */
  tokens?: TokenMap;

  /**
   * CSS properties to exclude from style comparison.
   */
  ignore?: string[];

  /**
   * Category weights for DFS and future evaluation logic.
   */
  weights?: Partial<
    Record<'color' | 'spacing' | 'radius' | 'border' | 'shadow' | 'typography', number>
  >;

  /**
   * Reuse shared browser instance (recommended in /loop).
   * @default false
   */
  reuseBrowser?: boolean;

  /**
   * Size handling mode for dimension mismatches.
   * - `strict`: Throw error on mismatch (default)
   * - `pad`: Add letterboxing to smaller image
   * - `crop`: Compare common region only
   * - `scale`: Scale to match dimensions
   * @default 'strict'
   */
  sizeMode?: 'strict' | 'pad' | 'crop' | 'scale';

  /**
   * Alignment for pad/crop modes.
   * @default 'center'
   */
  align?: 'center' | 'top-left' | 'top' | 'left';

  /**
   * Background color for padding ('auto' or RGB).
   * @default 'auto'
   */
  padColor?: 'auto' | { r: number; g: number; b: number };
}

/**
 * Comparison result
 */
export interface CompareResult {
  summary: string;
  report: {
    metrics: {
      pixelDiffRatio: number;
      pixelDiffRatioContent?: number;
      contentCoverage?: number;
      contentPixels?: number;
      colorDeltaEAvg: number;
      dfs: number;
    };
    dimensions?: {
      figma: { width: number; height: number };
      impl: { width: number; height: number };
      compared: { width: number; height: number };
      sizeMode: 'strict' | 'pad' | 'crop' | 'scale';
      adjusted: boolean;
    };
    styleDiffs: StyleDiff[];
    qualityGate?: {
      /**
       * Whether the implementation passes the quality gate.
       */
      pass: boolean;
      /**
       * Reasons why the implementation failed (if applicable).
       */
      reasons: string[];
      /**
       * Thresholds used for the quality gate.
       */
      thresholds: {
        pixelDiffRatio: number;
        deltaE: number;
      };
    };
    artifacts?: {
      figmaPngB64: string;
      implPngB64: string;
      diffPngB64: string;
    };
  };
}
