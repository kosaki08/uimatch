import { describe, expect, test } from 'bun:test';
import { PNG } from 'pngjs';
import { compareImages } from './core/compare';

describe('Content-only metrics', () => {
  test('should calculate pixelDiffRatioContent when pad mode is used', () => {
    // Create a small Figma image (10x10, red)
    const figmaPng = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < figmaPng.data.length; i += 4) {
      figmaPng.data[i] = 255; // R
      figmaPng.data[i + 1] = 0; // G
      figmaPng.data[i + 2] = 0; // B
      figmaPng.data[i + 3] = 255; // A
    }

    // Create a larger implementation image (20x20, red center with white background)
    const implPng = new PNG({ width: 20, height: 20 });
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const idx = (20 * y + x) * 4;
        // Red center 10x10, white background
        if (x >= 5 && x < 15 && y >= 5 && y < 15) {
          implPng.data[idx] = 255; // R
          implPng.data[idx + 1] = 0; // G
          implPng.data[idx + 2] = 0; // B
        } else {
          implPng.data[idx] = 255; // R
          implPng.data[idx + 1] = 255; // G
          implPng.data[idx + 2] = 255; // B
        }
        implPng.data[idx + 3] = 255; // A
      }
    }

    const result = compareImages({
      figmaPngB64: PNG.sync.write(figmaPng).toString('base64'),
      implPngB64: PNG.sync.write(implPng).toString('base64'),
      sizeMode: 'pad',
      align: 'center',
    });

    // Should have content-only metrics when pad mode is used with adjusted dimensions
    expect(result.pixelDiffRatioContent).toBeDefined();
    expect(result.contentCoverage).toBeDefined();
    expect(result.contentPixels).toBeDefined();

    // When both images are centered in a 20x20 canvas:
    // - Figma 10x10 centered: offset (5,5) -> rect (5,5) to (15,15)
    // - Impl 20x20: offset (0,0) -> rect (0,0) to (20,20)
    // Union of these rectangles is the entire 20x20 canvas = 400 pixels
    expect(result.contentCoverage).toBe(1.0);
    expect(result.contentPixels).toBe(400);

    // Global pixel diff ratio should be very low (mostly matching background)
    expect(result.pixelDiffRatio).toBeLessThan(0.01);

    // Content-only diff ratio should be 0 (identical red squares)
    expect(result.pixelDiffRatioContent).toBe(0);
  });

  test('should not calculate content-only metrics when dimensions match', () => {
    // Create identical 10x10 red images
    const createRedImage = () => {
      const png = new PNG({ width: 10, height: 10 });
      for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = 255; // R
        png.data[i + 1] = 0; // G
        png.data[i + 2] = 0; // B
        png.data[i + 3] = 255; // A
      }
      return png;
    };

    const figmaPng = createRedImage();
    const implPng = createRedImage();

    const result = compareImages({
      figmaPngB64: PNG.sync.write(figmaPng).toString('base64'),
      implPngB64: PNG.sync.write(implPng).toString('base64'),
      sizeMode: 'pad',
      align: 'center',
    });

    // Should not have content-only metrics when dimensions match (no adjustment)
    expect(result.pixelDiffRatioContent).toBeUndefined();
    expect(result.contentCoverage).toBeUndefined();
    expect(result.contentPixels).toBeUndefined();

    // But should have normal metrics
    expect(result.pixelDiffRatio).toBe(0);
    expect(result.dimensions.adjusted).toBe(false);
  });

  test('should calculate higher content-only ratio when content differs significantly', () => {
    // Create a small Figma image (10x10, red)
    const figmaPng = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < figmaPng.data.length; i += 4) {
      figmaPng.data[i] = 255; // R
      figmaPng.data[i + 1] = 0; // G
      figmaPng.data[i + 2] = 0; // B
      figmaPng.data[i + 3] = 255; // A
    }

    // Create a larger implementation image (20x20, blue center with white background)
    const implPng = new PNG({ width: 20, height: 20 });
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const idx = (20 * y + x) * 4;
        // Blue center 10x10, white background
        if (x >= 5 && x < 15 && y >= 5 && y < 15) {
          implPng.data[idx] = 0; // R
          implPng.data[idx + 1] = 0; // G
          implPng.data[idx + 2] = 255; // B
        } else {
          implPng.data[idx] = 255; // R
          implPng.data[idx + 1] = 255; // G
          implPng.data[idx + 2] = 255; // B
        }
        implPng.data[idx + 3] = 255; // A
      }
    }

    const result = compareImages({
      figmaPngB64: PNG.sync.write(figmaPng).toString('base64'),
      implPngB64: PNG.sync.write(implPng).toString('base64'),
      sizeMode: 'pad',
      align: 'center',
    });

    // Content-only ratio should be 25% (100 differing pixels / 400 total content pixels)
    // The centered 10x10 areas differ completely, but the white backgrounds match
    expect(result.pixelDiffRatioContent).toBe(0.25);

    // Global ratio should be the same in this case (content fills entire canvas)
    expect(result.pixelDiffRatio).toBe(0.25);

    // When content fills the entire canvas, content-only ratio equals global ratio
  });
});
