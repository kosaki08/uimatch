import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { CompareInput, CompareResult } from './types.ts';

/**
 * Compare two PNG images and return pixel difference metrics and a visual diff
 */
export async function compare(input: CompareInput): Promise<CompareResult> {
  const { figmaPngB64, implPngB64, threshold = 0.1 } = input;

  // Decode base64 to Buffer
  const figmaBuffer = Buffer.from(figmaPngB64, 'base64');
  const implBuffer = Buffer.from(implPngB64, 'base64');

  // Parse PNG images
  const figmaPng = PNG.sync.read(figmaBuffer);
  const implPng = PNG.sync.read(implBuffer);

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
    threshold,
    includeAA: false, // Disable anti-aliasing detection for cleaner diffs
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
