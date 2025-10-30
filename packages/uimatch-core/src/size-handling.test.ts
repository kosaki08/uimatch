/**
 * Tests for size handling modes (pad, crop, scale)
 */

import { describe, expect, test } from 'bun:test';
import { PNG } from 'pngjs';
import { compareImages } from './core/compare';

/**
 * Create a simple solid-color PNG for testing
 */
function createTestPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      png.data[idx] = color.r;
      png.data[idx + 1] = color.g;
      png.data[idx + 2] = color.b;
      png.data[idx + 3] = 255; // Fully opaque
    }
  }
  return png;
}

/**
 * Convert PNG to base64
 */
function pngToBase64(png: PNG): string {
  return PNG.sync.write(png).toString('base64');
}

describe('Size Handling Modes', () => {
  test('strict mode throws on dimension mismatch', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 100, { r: 255, g: 0, b: 0 });

    expect(() =>
      compareImages({
        figmaPngB64: pngToBase64(figmaPng),
        implPngB64: pngToBase64(implPng),
        sizeMode: 'strict',
      })
    ).toThrow('Image dimensions do not match');
  });

  test('pad mode handles width mismatch', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 100, { r: 255, g: 0, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
      align: 'center',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(120);
    expect(result.dimensions.compared.height).toBe(100);
    expect(result.dimensions.figma.width).toBe(100);
    expect(result.dimensions.impl.width).toBe(120);
  });

  test('pad mode handles height mismatch', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(100, 120, { r: 255, g: 0, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
      align: 'top-left',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(100);
    expect(result.dimensions.compared.height).toBe(120);
  });

  test('crop mode handles dimension mismatch', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 110, { r: 255, g: 0, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'crop',
      align: 'center',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(100);
    expect(result.dimensions.compared.height).toBe(100);
  });

  test('scale mode handles dimension mismatch', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 110, { r: 255, g: 0, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'scale',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(100);
    expect(result.dimensions.compared.height).toBe(100);
  });

  test('no adjustment when dimensions match', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
    });

    expect(result.dimensions.adjusted).toBe(false);
    expect(result.dimensions.compared.width).toBe(100);
    expect(result.dimensions.compared.height).toBe(100);
  });

  test('identical images with pad mode have zero diff ratio', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
    });

    expect(result.pixelDiffRatio).toBe(0);
  });

  test('pad mode with custom color', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 100, { r: 255, g: 0, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
      padColor: { r: 0, g: 0, b: 255 }, // Blue padding
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(120);
  });
});

describe('Alignment Options', () => {
  test('align: right with pad mode', () => {
    const figmaPng = createTestPng(80, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 100, { r: 0, g: 255, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
      align: 'right',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(120);
  });

  test('align: bottom with pad mode', () => {
    const figmaPng = createTestPng(100, 80, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(100, 120, { r: 0, g: 255, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
      align: 'bottom',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.height).toBe(120);
  });

  test('align: top-right with pad mode', () => {
    const figmaPng = createTestPng(80, 80, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 100, { r: 0, g: 255, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
      align: 'top-right',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(120);
    expect(result.dimensions.compared.height).toBe(100);
  });

  test('align: bottom-left with pad mode', () => {
    const figmaPng = createTestPng(80, 80, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 100, { r: 0, g: 255, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
      align: 'bottom-left',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(120);
    expect(result.dimensions.compared.height).toBe(100);
  });

  test('align: bottom-right with pad mode', () => {
    const figmaPng = createTestPng(80, 80, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 100, { r: 0, g: 255, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'pad',
      align: 'bottom-right',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(120);
    expect(result.dimensions.compared.height).toBe(100);
  });

  test('align: right with crop mode', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(120, 100, { r: 0, g: 255, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'crop',
      align: 'right',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.width).toBe(100);
  });

  test('align: bottom with crop mode', () => {
    const figmaPng = createTestPng(100, 100, { r: 255, g: 0, b: 0 });
    const implPng = createTestPng(100, 120, { r: 0, g: 255, b: 0 });

    const result = compareImages({
      figmaPngB64: pngToBase64(figmaPng),
      implPngB64: pngToBase64(implPng),
      sizeMode: 'crop',
      align: 'bottom',
    });

    expect(result.dimensions.adjusted).toBe(true);
    expect(result.dimensions.compared.height).toBe(100);
  });
});
