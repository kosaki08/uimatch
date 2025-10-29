import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { ExpectedSpec, StyleDiff, TokenMap } from '../types/index';
import { parseCssColorToRgb } from '../utils/normalize';
import { buildStyleDiffs, calculateStyleFidelityScore, type DiffOptions } from './diff';

/**
 * Size mode for handling dimension mismatches.
 * - `strict`: Require exact dimensions (throw on mismatch)
 * - `pad`: Add letterboxing to smaller image (recommended for development)
 * - `crop`: Compare only common region
 * - `scale`: Scale to match dimensions (may degrade quality)
 */
export type SizeMode = 'strict' | 'pad' | 'crop' | 'scale';

/**
 * Alignment for padding when using `pad` size mode.
 * - `center`: Center the smaller image (default)
 * - `top-left`: Align to top-left corner
 * - `top`: Center horizontally, align to top
 * - `left`: Align to left, center vertically
 */
export type ImageAlignment = 'center' | 'top-left' | 'top' | 'left';

/**
 * Content basis mode for calculating pixel difference ratio denominator.
 * - `union`: Union of both content areas (current default, can reach coverage=1.0 easily)
 * - `intersection`: Intersection of both content areas (excludes padding-induced expansion)
 * - `figma`: Use Figma's original content area only
 * - `impl`: Use implementation's original content area only
 */
export type ContentBasis = 'union' | 'intersection' | 'figma' | 'impl';

/**
 * Color specification for letterbox padding.
 */
export interface PadColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Options for pixelmatch comparison algorithm.
 */
export interface PixelmatchOptions {
  /**
   * Matching threshold (0 to 1). Smaller = more sensitive.
   * @default 0.1
   */
  threshold?: number;

  /**
   * Whether to skip anti-aliasing detection.
   * @default false
   */
  includeAA?: boolean;
}

/**
 * Size handling options for dimension mismatches.
 */
export interface SizeHandlingOptions {
  /**
   * How to handle dimension mismatches.
   * @default 'strict'
   */
  sizeMode?: SizeMode;

  /**
   * Alignment when using `pad` size mode.
   * @default 'center'
   */
  align?: ImageAlignment;

  /**
   * Background color for padding. 'auto' uses detected background color.
   * @default 'auto'
   */
  padColor?: 'auto' | PadColor;

  /**
   * Content basis for calculating pixelDiffRatioContent denominator.
   * - `union`: Union of both content areas (default for backward compatibility)
   * - `intersection`: Intersection only (excludes padding-induced expansion)
   * - `figma`: Figma's original content area
   * - `impl`: Implementation's original content area
   * @default 'union'
   */
  contentBasis?: ContentBasis;
}

/**
 * Input for image comparison.
 */
export interface CompareImageInput extends SizeHandlingOptions {
  /**
   * Figma design PNG as base64 string.
   */
  figmaPngB64: string;

  /**
   * Implementation screenshot PNG as base64 string.
   */
  implPngB64: string;

  /**
   * Pixelmatch configuration options.
   */
  pixelmatch?: PixelmatchOptions;

  /**
   * Captured styles from implementation (optional).
   * If provided, style differences will be calculated.
   */
  styles?: Record<string, Record<string, string>>;

  /**
   * Expected style specification (optional).
   * Required if `styles` is provided.
   */
  expectedSpec?: ExpectedSpec;

  /**
   * DOM element metadata (optional).
   * Used to enrich style diffs with precise CSS selectors.
   */
  meta?: Record<
    string,
    {
      tag: string;
      id?: string;
      class?: string;
      testid?: string;
      cssSelector?: string;
    }
  >;

  /**
   * Token map for design tokens (optional).
   */
  tokens?: TokenMap;

  /**
   * Diff options (thresholds, ignore, weights) (optional).
   */
  diffOptions?: DiffOptions;
}

/**
 * Dimension metadata for size handling.
 */
export interface DimensionInfo {
  /**
   * Original Figma design dimensions.
   */
  figma: { width: number; height: number };

  /**
   * Original implementation dimensions.
   */
  impl: { width: number; height: number };

  /**
   * Dimensions used for comparison (after size handling).
   */
  compared: { width: number; height: number };

  /**
   * Size mode applied.
   */
  sizeMode: SizeMode;

  /**
   * Whether dimensions were adjusted.
   */
  adjusted: boolean;
}

/**
 * Result of image comparison.
 */
export interface CompareImageResult {
  /**
   * Global pixel difference ratio (0 to 1).
   * This is calculated using the entire canvas including padding/background.
   */
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

  /**
   * Absolute count of different pixels.
   */
  diffPixelCount: number;

  /**
   * Visual diff image as base64 PNG.
   */
  diffPngB64: string;

  /**
   * Total pixel count (width × height).
   */
  totalPixels: number;

  /**
   * Total content pixels (union of figma and impl content areas).
   */
  contentPixels?: number;

  /**
   * Dimension information (original and compared sizes).
   */
  dimensions: DimensionInfo;

  /**
   * Style differences (if styles were provided).
   */
  styleDiffs?: StyleDiff[];

  /**
   * Average color delta E (if style differences were calculated).
   */
  colorDeltaEAvg?: number;

  /**
   * Style Fidelity Score (0-100, where 100 = perfect fidelity).
   * Calculated from normalized style differences across all categories.
   */
  styleFidelityScore?: number;
}

/**
 * Calculate offset for image alignment.
 * @param size - Size of the image to position
 * @param containerSize - Size of the container
 * @param alignment - Alignment mode
 * @returns x and y offsets
 */
function calculateOffset(
  size: { width: number; height: number },
  containerSize: { width: number; height: number },
  alignment: ImageAlignment
): { x: number; y: number } {
  switch (alignment) {
    case 'center':
      return {
        x: Math.floor((containerSize.width - size.width) / 2),
        y: Math.floor((containerSize.height - size.height) / 2),
      };
    case 'top-left':
      return { x: 0, y: 0 };
    case 'top':
      return {
        x: Math.floor((containerSize.width - size.width) / 2),
        y: 0,
      };
    case 'left':
      return {
        x: 0,
        y: Math.floor((containerSize.height - size.height) / 2),
      };
  }
}

/**
 * Count diff pixels within a specific content area from an existing diff image.
 * @param diffPng - Diff PNG image (result of pixelmatch)
 * @param contentRect - Rectangle defining content area {x1, y1, x2, y2}
 * @param canvasWidth - Canvas width
 * @returns Number of diff pixels within the content area
 */
function countDiffPixelsInRect(
  diffPng: PNG,
  contentRect: { x1: number; y1: number; x2: number; y2: number },
  canvasWidth: number
): number {
  let diffCount = 0;

  // Iterate through the content rectangle and count diff pixels
  for (let y = contentRect.y1; y < contentRect.y2; y++) {
    for (let x = contentRect.x1; x < contentRect.x2; x++) {
      const idx = (canvasWidth * y + x) * 4;

      // pixelmatch marks diff pixels with red color (255, 0, 0)
      // Check if this pixel is marked as different
      const r = diffPng.data[idx];
      const g = diffPng.data[idx + 1];
      const b = diffPng.data[idx + 2];

      if (r === 255 && g === 0 && b === 0) {
        diffCount++;
      }
    }
  }

  return diffCount;
}

/**
 * Calculate content area metrics for padded images.
 * @param figmaOriginal - Original Figma dimensions
 * @param implOriginal - Original implementation dimensions
 * @param canvasSize - Padded canvas dimensions
 * @param alignment - Alignment mode used for padding
 * @param basis - Content basis mode for calculating content pixels
 * @returns Content pixels (based on chosen basis), content coverage ratio, and content rectangle
 */
function calculateContentMetrics(
  figmaOriginal: { width: number; height: number },
  implOriginal: { width: number; height: number },
  canvasSize: { width: number; height: number },
  alignment: ImageAlignment,
  basis: ContentBasis = 'union'
): {
  contentPixels: number;
  contentCoverage: number;
  contentRect: { x1: number; y1: number; x2: number; y2: number };
} {
  // Calculate where each original image is positioned on the padded canvas
  const figmaOffset = calculateOffset(figmaOriginal, canvasSize, alignment);
  const implOffset = calculateOffset(implOriginal, canvasSize, alignment);

  // Define rectangles for each content area
  const figmaRect = {
    x1: figmaOffset.x,
    y1: figmaOffset.y,
    x2: figmaOffset.x + figmaOriginal.width,
    y2: figmaOffset.y + figmaOriginal.height,
  };

  const implRect = {
    x1: implOffset.x,
    y1: implOffset.y,
    x2: implOffset.x + implOriginal.width,
    y2: implOffset.y + implOriginal.height,
  };

  let contentPixels: number;
  let contentRect: { x1: number; y1: number; x2: number; y2: number };

  switch (basis) {
    case 'union': {
      // Union of both content areas (original behavior)
      contentRect = {
        x1: Math.min(figmaRect.x1, implRect.x1),
        y1: Math.min(figmaRect.y1, implRect.y1),
        x2: Math.max(figmaRect.x2, implRect.x2),
        y2: Math.max(figmaRect.y2, implRect.y2),
      };
      contentPixels = (contentRect.x2 - contentRect.x1) * (contentRect.y2 - contentRect.y1);
      break;
    }
    case 'intersection': {
      // Intersection of both content areas (excludes padding-induced expansion)
      contentRect = {
        x1: Math.max(figmaRect.x1, implRect.x1),
        y1: Math.max(figmaRect.y1, implRect.y1),
        x2: Math.min(figmaRect.x2, implRect.x2),
        y2: Math.min(figmaRect.y2, implRect.y2),
      };
      // If no intersection, return 0
      const width = Math.max(0, contentRect.x2 - contentRect.x1);
      const height = Math.max(0, contentRect.y2 - contentRect.y1);
      contentPixels = width * height;
      break;
    }
    case 'figma': {
      // Use Figma's original content area only
      contentRect = figmaRect;
      contentPixels = figmaOriginal.width * figmaOriginal.height;
      break;
    }
    case 'impl': {
      // Use implementation's original content area only
      contentRect = implRect;
      contentPixels = implOriginal.width * implOriginal.height;
      break;
    }
  }

  // Calculate coverage ratio
  const totalPixels = canvasSize.width * canvasSize.height;
  const contentCoverage = totalPixels > 0 ? contentPixels / totalPixels : 0;

  return { contentPixels, contentCoverage, contentRect };
}

/**
 * Pad a PNG image with background color to match target dimensions.
 * @param png - Source PNG to pad
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @param bgColor - Background color for padding
 * @param alignment - How to align the source image
 * @returns New padded PNG
 */
function padImage(
  png: PNG,
  targetWidth: number,
  targetHeight: number,
  bgColor: PadColor,
  alignment: ImageAlignment
): PNG {
  const padded = new PNG({ width: targetWidth, height: targetHeight });

  // Fill with background color
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = (targetWidth * y + x) * 4;
      padded.data[idx] = bgColor.r;
      padded.data[idx + 1] = bgColor.g;
      padded.data[idx + 2] = bgColor.b;
      padded.data[idx + 3] = 255; // Fully opaque
    }
  }

  // Calculate offset based on alignment
  const offset = calculateOffset({ width: png.width, height: png.height }, padded, alignment);

  // Copy source image at the calculated offset
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const srcIdx = (png.width * y + x) * 4;
      const dstIdx = (targetWidth * (y + offset.y) + (x + offset.x)) * 4;
      const r = png.data[srcIdx];
      const g = png.data[srcIdx + 1];
      const b = png.data[srcIdx + 2];
      const a = png.data[srcIdx + 3];
      if (r !== undefined) padded.data[dstIdx] = r;
      if (g !== undefined) padded.data[dstIdx + 1] = g;
      if (b !== undefined) padded.data[dstIdx + 2] = b;
      if (a !== undefined) padded.data[dstIdx + 3] = a;
    }
  }

  return padded;
}

/**
 * Crop a PNG image to common region dimensions.
 * @param png - Source PNG to crop
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @param alignment - Crop alignment
 * @returns New cropped PNG
 */
function cropImage(
  png: PNG,
  targetWidth: number,
  targetHeight: number,
  alignment: ImageAlignment
): PNG {
  const cropped = new PNG({ width: targetWidth, height: targetHeight });

  // Calculate crop offset
  const offset = calculateOffset({ width: targetWidth, height: targetHeight }, png, alignment);

  // Copy pixels from source to cropped image
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcIdx = (png.width * (y + offset.y) + (x + offset.x)) * 4;
      const dstIdx = (targetWidth * y + x) * 4;
      const r = png.data[srcIdx];
      const g = png.data[srcIdx + 1];
      const b = png.data[srcIdx + 2];
      const a = png.data[srcIdx + 3];
      if (r !== undefined) cropped.data[dstIdx] = r;
      if (g !== undefined) cropped.data[dstIdx + 1] = g;
      if (b !== undefined) cropped.data[dstIdx + 2] = b;
      if (a !== undefined) cropped.data[dstIdx + 3] = a;
    }
  }

  return cropped;
}

/**
 * Simple nearest-neighbor scaling (basic implementation).
 * For production, consider using a library like sharp for higher quality.
 * @param png - Source PNG to scale
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @returns New scaled PNG
 */
function scaleImage(png: PNG, targetWidth: number, targetHeight: number): PNG {
  const scaled = new PNG({ width: targetWidth, height: targetHeight });
  const xRatio = png.width / targetWidth;
  const yRatio = png.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcIdx = (png.width * srcY + srcX) * 4;
      const dstIdx = (targetWidth * y + x) * 4;

      const r = png.data[srcIdx];
      const g = png.data[srcIdx + 1];
      const b = png.data[srcIdx + 2];
      const a = png.data[srcIdx + 3];
      if (r !== undefined) scaled.data[dstIdx] = r;
      if (g !== undefined) scaled.data[dstIdx + 1] = g;
      if (b !== undefined) scaled.data[dstIdx + 2] = b;
      if (a !== undefined) scaled.data[dstIdx + 3] = a;
    }
  }

  return scaled;
}

/**
 * Compares two PNG images and returns pixel difference metrics.
 * Optionally calculates style differences if styles are provided.
 *
 * @param input - Images, styles, and comparison options
 * @returns Pixel diff ratio, count, visual diff, total pixels, and style diffs (if applicable)
 * @throws If image dimensions don't match and sizeMode is 'strict'
 */
export function compareImages(input: CompareImageInput): CompareImageResult {
  const {
    figmaPngB64,
    implPngB64,
    pixelmatch: opts = {},
    styles,
    expectedSpec,
    tokens,
    diffOptions,
    sizeMode = 'strict',
    align = 'center',
    padColor = 'auto',
    contentBasis = 'union',
  } = input;

  // Decode base64 to Buffer
  const figmaBuffer = Buffer.from(figmaPngB64, 'base64');
  const implBuffer = Buffer.from(implPngB64, 'base64');

  // Parse PNG images
  let figmaPng = PNG.sync.read(figmaBuffer) as PNG;
  let implPng = PNG.sync.read(implBuffer) as PNG;

  // Store original dimensions
  const originalFigmaDim = { width: figmaPng.width, height: figmaPng.height };
  const originalImplDim = { width: implPng.width, height: implPng.height };

  // Determine background color from captured styles, fallback to white
  const bg = (() => {
    if (padColor !== 'auto') return padColor;
    const bgColor = input.styles?.['__self__']?.['background-color'];
    if (bgColor) {
      const rgb = parseCssColorToRgb(bgColor);
      if (rgb) return { r: rgb.r, g: rgb.g, b: rgb.b };
    }
    return { r: 255, g: 255, b: 255 }; // Default to white
  })();

  // Flatten transparency to background color to avoid alpha-related noise
  const flattenToOpaque = (png: PNG, bgColor = bg) => {
    const data = png.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const a = alpha !== undefined ? alpha / 255 : 1;
      if (a < 1) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r !== undefined) data[i] = Math.round(r * a + bgColor.r * (1 - a));
        if (g !== undefined) data[i + 1] = Math.round(g * a + bgColor.g * (1 - a));
        if (b !== undefined) data[i + 2] = Math.round(b * a + bgColor.b * (1 - a));
        data[i + 3] = 255;
      }
    }
  };
  flattenToOpaque(figmaPng);
  flattenToOpaque(implPng);

  // Handle dimension mismatches based on sizeMode
  let adjusted = false;
  const dimensionsDiffer = figmaPng.width !== implPng.width || figmaPng.height !== implPng.height;

  if (dimensionsDiffer) {
    if (sizeMode === 'strict') {
      throw new Error(
        `Image dimensions do not match: ` +
          `Figma (${figmaPng.width}x${figmaPng.height}) vs ` +
          `Implementation (${implPng.width}x${implPng.height})`
      );
    }

    adjusted = true;

    if (sizeMode === 'pad') {
      // Pad to larger dimensions
      const maxWidth = Math.max(figmaPng.width, implPng.width);
      const maxHeight = Math.max(figmaPng.height, implPng.height);

      if (figmaPng.width < maxWidth || figmaPng.height < maxHeight) {
        figmaPng = padImage(figmaPng, maxWidth, maxHeight, bg, align);
      }
      if (implPng.width < maxWidth || implPng.height < maxHeight) {
        implPng = padImage(implPng, maxWidth, maxHeight, bg, align);
      }
    } else if (sizeMode === 'crop') {
      // Crop to smaller dimensions (common region)
      const minWidth = Math.min(figmaPng.width, implPng.width);
      const minHeight = Math.min(figmaPng.height, implPng.height);

      if (figmaPng.width > minWidth || figmaPng.height > minHeight) {
        figmaPng = cropImage(figmaPng, minWidth, minHeight, align);
      }
      if (implPng.width > minWidth || implPng.height > minHeight) {
        implPng = cropImage(implPng, minWidth, minHeight, align);
      }
    } else if (sizeMode === 'scale') {
      // Scale implementation to match Figma dimensions
      if (implPng.width !== figmaPng.width || implPng.height !== figmaPng.height) {
        implPng = scaleImage(implPng, figmaPng.width, figmaPng.height);
      }
    }
  }

  const { width, height } = figmaPng;
  const totalPixels = width * height;

  // Create diff image
  const diff = new PNG({ width, height });

  // Perform pixel comparison
  const diffPixelCount = pixelmatch(figmaPng.data, implPng.data, diff.data, width, height, {
    threshold: opts.threshold ?? 0.1,
    includeAA: opts.includeAA ?? false,
  });

  // Calculate pixel difference ratio
  const pixelDiffRatio = totalPixels > 0 ? diffPixelCount / totalPixels : 0;

  // Encode diff image to base64
  const diffBuffer = PNG.sync.write(diff);
  const diffPngB64 = diffBuffer.toString('base64');

  const result: CompareImageResult = {
    pixelDiffRatio,
    diffPngB64,
    diffPixelCount,
    totalPixels,
    dimensions: {
      figma: originalFigmaDim,
      impl: originalImplDim,
      compared: { width, height },
      sizeMode,
      adjusted,
    },
  };

  // Calculate content-only metrics when padding was applied
  if (sizeMode === 'pad' && adjusted) {
    const contentMetrics = calculateContentMetrics(
      originalFigmaDim,
      originalImplDim,
      { width, height },
      align,
      contentBasis
    );

    result.contentPixels = contentMetrics.contentPixels;
    result.contentCoverage = contentMetrics.contentCoverage;

    // Calculate content-only pixel diff ratio by counting diff pixels within content rect
    if (contentMetrics.contentPixels > 0) {
      const diffPixelCountInContent = countDiffPixelsInRect(
        diff,
        contentMetrics.contentRect,
        width
      );
      result.pixelDiffRatioContent = diffPixelCountInContent / contentMetrics.contentPixels;
    }
  }

  // Calculate style differences if styles are provided
  if (styles && expectedSpec) {
    const styleDiffs = buildStyleDiffs(styles, expectedSpec, {
      ...diffOptions,
      tokens,
      meta: input.meta,
    });

    result.styleDiffs = styleDiffs;

    // Calculate average color delta E (including box-shadow color)
    const colorDeltas: number[] = [];
    for (const diff of styleDiffs) {
      for (const prop of ['color', 'background-color', 'border-color', 'box-shadow']) {
        const propDiff = diff.properties[prop];
        if (propDiff?.delta && propDiff.unit === 'ΔE') {
          colorDeltas.push(propDiff.delta);
        }
      }
    }

    if (colorDeltas.length > 0) {
      result.colorDeltaEAvg = colorDeltas.reduce((sum, d) => sum + d, 0) / colorDeltas.length;
    }

    // Calculate Style Fidelity Score
    result.styleFidelityScore = calculateStyleFidelityScore(styleDiffs, diffOptions?.weights);
  }

  return result;
}
