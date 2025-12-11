/**
 * Type definitions for @uimatch/cli
 */

import type { StyleSummary } from '#plugin/utils/style-score';
import type { ExpectedSpec, QualityGateResult, StyleDiff, TokenMap } from '@uimatch/core';

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

  /**
   * Area gap threshold for immediate failure (0-1).
   * @default 0.15 (15%)
   */
  areaGapCritical?: number;

  /**
   * Area gap threshold for warning (0-1).
   * @default 0.05 (5%)
   */
  areaGapWarning?: number;
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
   * Optional child element inside `selector` for Figma child-node mapping.
   * When provided, finds the best matching Figma child node based on size/position.
   * Supports CSS, dompath, role, testid, and text selectors.
   */
  subselector?: string;

  /**
   * Strategy for child-node mapping (when subselector is provided).
   * - `area`: Match by size only
   * - `area+position`: Match by size and relative position (default)
   * @default 'area+position'
   */
  figmaChildStrategy?: 'area' | 'area+position';

  /**
   * Viewport dimensions.
   */
  viewport?: { width: number; height: number };

  /**
   * Device pixel ratio (for browser capture).
   * @default 2
   */
  dpr?: number;

  /**
   * Figma image scale (separate from browser DPR).
   * Allows independent control of Figma export resolution.
   * @default 2
   */
  figmaScale?: number;

  /**
   * Enable automatic ROI detection from Figma child nodes.
   * When true, if specified node is much larger than implementation capture,
   * automatically finds closest matching child frame and uses it instead.
   * @default false
   */
  figmaAutoRoi?: boolean;

  /**
   * Maximum child elements to collect styles from.
   * @default 200
   */
  maxChildren?: number;

  /**
   * CSS properties to collect.
   * - `default`: A curated list of common properties.
   * - `extended`: `default` + additional layout and visual properties.
   * - `all`: All computed styles.
   * @default 'extended'
   */
  propsMode?: 'default' | 'extended' | 'all';

  /**
   * Maximum depth to traverse for child elements.
   * @default 6
   */
  maxDepth?: number;

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
    Record<'color' | 'spacing' | 'radius' | 'border' | 'shadow' | 'typography' | 'pixel', number>
  >;

  /**
   * If true and expectedSpec is not provided, derive a minimal expectedSpec
   * from Figma node JSON (REST) focusing on robust properties.
   * @default false
   */
  bootstrapExpectedFromFigma?: boolean;

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

  /**
   * Content basis mode for calculating pixelDiffRatioContent denominator.
   * - `union`: Union of both content areas (default, can reach coverage=1.0 easily)
   * - `intersection`: Intersection only (excludes padding-induced expansion)
   * - `figma`: Figma's original content area
   * - `impl`: Implementation's original content area
   * @default 'union'
   */
  contentBasis?: 'union' | 'intersection' | 'figma' | 'impl';

  /**
   * Path to selector anchors JSON (LLM-managed TODO/JSON).
   * Enables automatic selector resolution and liveness checking.
   */
  selectorsPath?: string;

  /**
   * Write back resolved selectors to anchors JSON.
   * @default false
   */
  selectorsWriteBack?: boolean;

  /**
   * Plugin module ID for selector resolution.
   * Falls back to UIMATCH_SELECTORS_PLUGIN environment variable if not specified.
   * @default '@uimatch/selector-anchors'
   */
  selectorsPlugin?: string;

  /**
   * Enable verbose logging (informational messages about mode, URLs, etc.).
   * When false, only warnings and errors are shown.
   * @default false (quiet for programmatic use), true (CLI)
   */
  verbose?: boolean;

  /**
   * Figma ↔ Implementation text matching configuration.
   * Validates that text content matches between design and implementation.
   * @default { enabled: false }
   */
  textCheck?: {
    /** Enable text matching validation (default: false) */
    enabled?: boolean;
    /** Scope of text collection: 'self' (element only) or 'descendants' (element + children) (default: 'self') */
    mode?: 'self' | 'descendants';
    /** Normalization mode: 'none', 'nfkc', or 'nfkc_ws' (NFKC + whitespace collapse) (default: 'nfkc_ws') */
    normalize?: 'none' | 'nfkc' | 'nfkc_ws';
    /** Case-sensitive comparison (default: false) */
    caseSensitive?: boolean;
    /** Matching mode: 'exact', 'contains' (Figma ⊆ Impl), or 'ratio' (similarity score) (default: 'ratio') */
    match?: 'exact' | 'contains' | 'ratio';
    /** Minimum similarity ratio for 'ratio' mode (default: 0.98) */
    minRatio?: number;
  };
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
      /**
       * Content rectangle coordinates (x1, y1, x2, y2) in the compared image space.
       * Present when size adjustment creates padding and content areas differ.
       */
      contentRect?: { x1: number; y1: number; x2: number; y2: number };
    };
    styleDiffs: StyleDiff[];
    styleSummary?: StyleSummary;

    /**
     * Quality gate evaluation result.
     * Backwards-compatible JSON structure with additional fields for advanced metrics.
     */
    qualityGate?: QualityGateResult;

    /**
     * Additional metadata about the comparison
     */
    meta?: {
      /**
       * Auto-ROI detection metadata (when figmaAutoRoi is enabled)
       */
      figmaAutoRoi?: {
        applied: boolean;
        from?: string;
        to?: string;
      };
    };

    /**
     * Text matching result (when textCheck is enabled)
     */
    textMatch?: {
      enabled: boolean;
      mode: 'self' | 'descendants';
      normalize: 'none' | 'nfkc' | 'nfkc_ws';
      caseSensitive: boolean;
      match: 'exact' | 'contains' | 'ratio';
      minRatio: number;
      figma: { raw: string; normalized: string };
      impl: { raw: string; normalized: string };
      equal: boolean;
      ratio: number;
      details?: { missing?: string[]; extra?: string[] };
    };

    artifacts?: {
      figmaPngB64: string;
      implPngB64: string;
      diffPngB64: string;
    };
  };
}
