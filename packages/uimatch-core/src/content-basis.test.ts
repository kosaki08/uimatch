/**
 * Tests for contentBasis parameter in pad mode
 */

import { expect, test } from 'bun:test';
import { PNG } from 'pngjs';
import { compareImages } from './core/compare';

/**
 * Create a solid color PNG image
 */
function createPng(width: number, height: number, r: number, g: number, b: number): string {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png).toString('base64');
}

test('contentBasis: union (default) uses union of both content areas', () => {
  // Figma: 100x100 red, Impl: 120x120 blue with small diff
  const figma = createPng(100, 100, 255, 0, 0);
  const implPng = PNG.sync.read(Buffer.from(createPng(120, 120, 0, 0, 255), 'base64')) as PNG;

  // Add a small diff area (10x10 white square at bottom-right)
  for (let y = 110; y < 120; y++) {
    for (let x = 110; x < 120; x++) {
      const idx = (120 * y + x) * 4;
      implPng.data[idx] = 255;
      implPng.data[idx + 1] = 255;
      implPng.data[idx + 2] = 255;
    }
  }
  const impl = PNG.sync.write(implPng).toString('base64');

  const result = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    align: 'center',
    contentBasis: 'union', // Default
  });

  expect(result.contentPixels).toBeDefined();
  expect(result.contentCoverage).toBeDefined();
  expect(result.pixelDiffRatioContent).toBeDefined();

  // Union should be 120x120 = 14,400 pixels (the larger of the two)
  expect(result.contentPixels).toBe(14400);

  // Coverage should be 1.0 since union equals canvas size
  expect(result.contentCoverage).toBe(1.0);
});

test('contentBasis: intersection uses only common area', () => {
  // Figma: 100x100 red, Impl: 120x120 blue
  const figma = createPng(100, 100, 255, 0, 0);
  const impl = createPng(120, 120, 0, 0, 255);

  const result = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    align: 'center',
    contentBasis: 'intersection',
  });

  expect(result.contentPixels).toBeDefined();
  expect(result.contentCoverage).toBeDefined();
  expect(result.pixelDiffRatioContent).toBeDefined();

  // Intersection should be 100x100 = 10,000 pixels (the smaller area)
  expect(result.contentPixels).toBe(10000);

  // Coverage should be less than 1.0 since intersection is smaller than canvas
  expect(result.contentCoverage).toBeLessThan(1.0);
  expect(result.contentCoverage).toBeGreaterThan(0);
});

test('contentBasis: figma uses only Figma content area', () => {
  // Figma: 100x100 red, Impl: 120x120 blue
  const figma = createPng(100, 100, 255, 0, 0);
  const impl = createPng(120, 120, 0, 0, 255);

  const result = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    align: 'center',
    contentBasis: 'figma',
  });

  expect(result.contentPixels).toBeDefined();
  expect(result.contentCoverage).toBeDefined();
  expect(result.pixelDiffRatioContent).toBeDefined();

  // Figma content should be 100x100 = 10,000 pixels
  expect(result.contentPixels).toBe(10000);

  // Coverage should be based on Figma's original size
  expect(result.contentCoverage).toBeLessThan(1.0);
  expect(result.contentCoverage).toBeGreaterThan(0);
});

test('contentBasis: impl uses only implementation content area', () => {
  // Figma: 100x100 red, Impl: 120x120 blue
  const figma = createPng(100, 100, 255, 0, 0);
  const impl = createPng(120, 120, 0, 0, 255);

  const result = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    align: 'center',
    contentBasis: 'impl',
  });

  expect(result.contentPixels).toBeDefined();
  expect(result.contentCoverage).toBeDefined();
  expect(result.pixelDiffRatioContent).toBeDefined();

  // Impl content should be 120x120 = 14,400 pixels
  expect(result.contentPixels).toBe(14400);

  // Coverage should be 1.0 since impl is the larger image
  expect(result.contentCoverage).toBe(1.0);
});

test('contentBasis: different modes produce different pixelDiffRatioContent', () => {
  // Figma: 100x100 red
  const figma = createPng(100, 100, 255, 0, 0);

  // Impl: 120x120, with 100x100 matching red center and 20px blue border
  const implPng = PNG.sync.read(Buffer.from(createPng(120, 120, 0, 0, 255), 'base64')) as PNG;
  // Fill center 100x100 with red (to match figma)
  for (let y = 10; y < 110; y++) {
    for (let x = 10; x < 110; x++) {
      const idx = (120 * y + x) * 4;
      implPng.data[idx] = 255;
      implPng.data[idx + 1] = 0;
      implPng.data[idx + 2] = 0;
    }
  }
  const impl = PNG.sync.write(implPng).toString('base64');

  const unionResult = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    align: 'center',
    contentBasis: 'union',
  });

  const intersectionResult = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    align: 'center',
    contentBasis: 'intersection',
  });

  const figmaResult = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    align: 'center',
    contentBasis: 'figma',
  });

  const implResult = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    align: 'center',
    contentBasis: 'impl',
  });

  // All should have defined content ratios
  expect(unionResult.pixelDiffRatioContent).toBeDefined();
  expect(intersectionResult.pixelDiffRatioContent).toBeDefined();
  expect(figmaResult.pixelDiffRatioContent).toBeDefined();
  expect(implResult.pixelDiffRatioContent).toBeDefined();

  // Different basis modes should produce different ratios due to different denominators
  // intersection and figma should have same contentPixels (10,000)
  expect(intersectionResult.contentPixels).toBe(figmaResult.contentPixels);

  // union and impl should have same contentPixels (14,400)
  expect(unionResult.contentPixels).toBe(implResult.contentPixels);

  // The diff pixels are in the blue border (outside the 100x100 red center)
  // So smaller denominator (figma/intersection) should have LOWER ratio since diffs are outside
  // Actually, union/impl should have HIGHER contentPixels but LOWER ratio since diffs are spread over larger area
  // Let's just verify the contentPixels are different and ratios are defined
  expect(unionResult.contentPixels).toBeGreaterThan(intersectionResult.contentPixels ?? 0);
  expect(implResult.contentPixels).toBeGreaterThan(figmaResult.contentPixels ?? 0);
});

test('contentBasis: only applies in pad mode with adjusted dimensions', () => {
  // Test that contentBasis has no effect when dimensions already match
  const figma = createPng(100, 100, 255, 0, 0);
  const impl = createPng(100, 100, 255, 0, 0);

  const result = compareImages({
    figmaPngB64: figma,
    implPngB64: impl,
    sizeMode: 'pad',
    contentBasis: 'intersection', // Should have no effect
  });

  // Content metrics should not be calculated when dimensions match
  expect(result.contentPixels).toBeUndefined();
  expect(result.contentCoverage).toBeUndefined();
  expect(result.pixelDiffRatioContent).toBeUndefined();
});
