export type { PartialComputedStyle } from '../utils/visual-axis';
export type { BrowserAdapter, CaptureOptions, CaptureResult, ElementMeta } from './adapters';
export { createCaptureError, createComparisonError, createConfigError } from './errors';
export type { AppError, BaseError, CaptureError, ComparisonError, ConfigError } from './errors';
export {
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
  unwrapOr,
  type Failure,
  type Result,
  type Success,
} from './result';

/**
 * Figma layout metadata for axis inference
 */
export interface FigmaLayoutMeta {
  /** Layout mode from Figma: "HORIZONTAL" | "VERTICAL" | "NONE" */
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  /** Item spacing (gap) in pixels */
  itemSpacing?: number;
}

/**
 * Input for the compare function
 */
export interface CompareInput {
  /** Base64-encoded PNG image from Figma design */
  figmaPngB64: string;
  /** Base64-encoded PNG image from implementation */
  implPngB64: string;
  /**
   * pixelmatch's internal threshold (0..1).
   * This is NOT the acceptance threshold for pixelDiffRatio.
   * Controls the sensitivity of pixel matching (lower = more strict).
   * default: 0.1
   */
  threshold?: number;
  /** Figma layout metadata (for layout axis analysis) */
  figmaLayoutMeta?: FigmaLayoutMeta;
}

/**
 * Output from the compare function
 */
export interface CompareResult {
  /** Global pixel difference ratio (0-1, where 0 = identical, 1 = completely different) */
  pixelDiffRatio: number;
  /**
   * Content-only pixel difference ratio (diff pixels / content area).
   * This normalizes against actual content area instead of entire canvas,
   * giving a more intuitive measure that matches visual perception.
   */
  pixelDiffRatioContent?: number;
  /**
   * Content coverage ratio (content area / total canvas).
   * Shows what percentage of the canvas is actual content vs. padding/background.
   */
  contentCoverage?: number;
  /** Base64-encoded PNG showing visual diff */
  diffPngB64: string;
  /** Number of pixels that differ */
  diffPixelCount: number;
  /** Total number of pixels compared */
  totalPixels: number;
  /** Total content pixels (union of figma and impl content areas) */
  contentPixels?: number;
  /** Style differences detected */
  styleDiffs?: StyleDiff[];
  /** Average color delta E (perceptual color difference) */
  colorDeltaEAvg?: number;
  /** Layout axis analysis result (if layout data provided) */
  layoutAnalysis?: AxisAnalysisResult;
}

/**
 * Token map for design tokens
 */
export interface TokenMap {
  /** Color tokens (CSS variable name -> hex color) */
  color?: Record<string, string>;
  /** Spacing tokens (CSS variable name -> px value) */
  spacing?: Record<string, string>;
  /** Radius tokens (CSS variable name -> px value) */
  radius?: Record<string, string>;
  /** Typography tokens (CSS variable name -> value) */
  typography?: Record<string, string>;
}

/**
 * Expected style specification
 */
export type ExpectedSpec = Record<string, Partial<Record<string, string>>>;

/**
 * Scope of element in DOM hierarchy for staged checking
 * - ancestor: Parent container element (background, border-radius, padding, gap)
 * - self: Element itself (typography, sizing, etc.)
 * - descendant: Child elements
 */
export type DiffScope = 'ancestor' | 'self' | 'descendant';

/**
 * Checking stage for progressive validation
 * - parent: Check only parent container styles first
 * - self: Check element's own styles
 * - children: Check child elements
 * - all: Check all levels (default)
 */
export type CheckingStage = 'parent' | 'self' | 'children' | 'all';

/**
 * Style difference detected between design and implementation
 */
export interface StyleDiff {
  /** CSS selector for the element (e.g., "div.w-full", "[data-testid='button']") */
  selector: string;
  /** Property-level differences */
  properties: Record<
    string,
    {
      actual?: string;
      expected?: string;
      expectedToken?: string;
      delta?: number;
      unit?: string;
    }
  >;
  /** Overall severity of differences */
  severity: 'low' | 'medium' | 'high';
  /** Patch hints for fixing the differences */
  patchHints?: PatchHint[];
  /** DOM element metadata for generating precise selectors */
  meta?: {
    tag: string;
    id?: string;
    class?: string;
    testid?: string;
    cssSelector?: string;
    height?: number;
  };
  /**
   * Priority score for fix recommendations (0-100, higher = more important)
   * Based on: layout impact, element prominence, token usage, severity
   */
  priorityScore?: number;
  /**
   * Scope of this diff in DOM hierarchy
   * Used for staged checking to prioritize parent → self → children validation
   */
  scope?: DiffScope;
}

/**
 * Suggested fix for a style difference
 */
export interface PatchHint {
  /** Property to change */
  property: string;
  /** Suggested CSS value */
  suggestedValue: string;
  /** File path (if known) */
  file?: string;
  /** Line number (if known) */
  line?: number;
  /** Severity of the issue */
  severity: 'low' | 'medium' | 'high';
}

/**
 * Visual axis types for layout analysis
 */
export type Axis = 'horizontal' | 'vertical' | 'ambiguous';

/**
 * Rectangle for axis inference
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Result of visual axis analysis
 */
export interface AxisAnalysisResult {
  /** Inferred visual axis from child element positions */
  visualAxis: Axis;
  /** Declared layout mode from Figma (if available) */
  declaredMode?: 'horizontal' | 'vertical';
  /** True comparison axis (prioritizes visual over declared) */
  trueAxis: Axis;
  /** Confidence score for axis inference (0-1) */
  confidence: number;
  /** Whether there's a mismatch between declared and visual */
  hasMismatch: boolean;
  /** Whether visual axis is ambiguous (useful for severity adjustment) */
  ambiguous: boolean;
}

/**
 * Expected layout specification based on axis analysis
 */
export interface ExpectedLayout {
  display: 'flex' | 'grid';
  flexDirection?: 'row' | 'column';
  gap?: string;
  alignItems?: string;
  gridAutoFlow?: 'row' | 'column';
  gridTemplateColumns?: string;
}
