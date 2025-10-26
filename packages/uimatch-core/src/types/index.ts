export type { BrowserAdapter, CaptureOptions, CaptureResult } from './adapters';
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
}

/**
 * Output from the compare function
 */
export interface CompareResult {
  /** Pixel difference ratio (0-1, where 0 = identical, 1 = completely different) */
  pixelDiffRatio: number;
  /** Base64-encoded PNG showing visual diff */
  diffPngB64: string;
  /** Number of pixels that differ */
  diffPixelCount: number;
  /** Total number of pixels compared */
  totalPixels: number;
  /** Style differences detected */
  styleDiffs?: StyleDiff[];
  /** Average color delta E (perceptual color difference) */
  colorDeltaEAvg?: number;
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
 * Style difference detected between design and implementation
 */
export interface StyleDiff {
  /** Element path (e.g., "self", "[data-testid='button']") */
  path: string;
  /** CSS selector */
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
