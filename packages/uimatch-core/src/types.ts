/**
 * Input for the compare function
 */
export interface CompareInput {
  /** Base64-encoded PNG image from Figma design */
  figmaPngB64: string;
  /** Base64-encoded PNG image from implementation */
  implPngB64: string;
  /** Optional: Threshold for pixel difference (0-1, default: 0.03) */
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
}
