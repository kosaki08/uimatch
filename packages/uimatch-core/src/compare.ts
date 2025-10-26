import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

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
   * @default true
   */
  includeAA?: boolean;
}

/**
 * Input for image comparison.
 */
export interface CompareImageInput {
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
}

/**
 * Result of image comparison.
 */
export interface CompareImageResult {
  /**
   * Ratio of different pixels (0 to 1).
   */
  pixelDiffRatio: number;

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
}

/**
 * Compares two PNG images and returns pixel difference metrics.
 *
 * @param input - Images and comparison options
 * @returns Pixel diff ratio, count, visual diff, and total pixels
 * @throws If image dimensions don't match
 */
export function compareImages(input: CompareImageInput): CompareImageResult {
  const { figmaPngB64, implPngB64, pixelmatch: opts = {} } = input;

  // Decode base64 to Buffer
  const figmaBuffer = Buffer.from(figmaPngB64, 'base64');
  const implBuffer = Buffer.from(implPngB64, 'base64');

  // Parse PNG images
  const figmaPng = PNG.sync.read(figmaBuffer) as PNG;
  const implPng = PNG.sync.read(implBuffer) as PNG;

  // Ensure images have the same dimensions
  if (figmaPng.width !== implPng.width || figmaPng.height !== implPng.height) {
    throw new Error(
      `Image dimensions do not match: ` +
        `Figma (${figmaPng.width}x${figmaPng.height}) vs ` +
        `Implementation (${implPng.width}x${implPng.height})`
    );
  }

  const { width, height } = figmaPng;
  const totalPixels = width * height;

  // Create diff image
  const diff = new PNG({ width, height });

  // Perform pixel comparison
  const diffPixelCount = pixelmatch(figmaPng.data, implPng.data, diff.data, width, height, {
    threshold: opts.threshold ?? 0.1,
    includeAA: opts.includeAA ?? true,
  });

  // Calculate pixel difference ratio
  const pixelDiffRatio = totalPixels > 0 ? diffPixelCount / totalPixels : 0;

  // Encode diff image to base64
  const diffBuffer = PNG.sync.write(diff);
  const diffPngB64 = diffBuffer.toString('base64');

  return {
    pixelDiffRatio,
    diffPngB64,
    diffPixelCount,
    totalPixels,
  };
}
