#!/usr/bin/env bun
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

/**
 * Create a simple colored rectangle PNG
 */
function createColoredPng(width: number, height: number, r: number, g: number, b: number): PNG {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255; // Alpha
    }
  }

  return png;
}

/**
 * Create a PNG with a small difference
 */
function createSlightlyDifferentPng(width: number, height: number): PNG {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // Red background
      png.data[idx] = 255;
      png.data[idx + 1] = 0;
      png.data[idx + 2] = 0;
      png.data[idx + 3] = 255;

      // Add a small white square in the center
      if (x >= width / 2 - 5 && x <= width / 2 + 5 && y >= height / 2 - 5 && y <= height / 2 + 5) {
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
      }
    }
  }

  return png;
}

// Generate test fixtures
console.log('Generating test fixtures...');

// 1. Identical images (red rectangles)
const red1 = createColoredPng(100, 100, 255, 0, 0);
const red2 = createColoredPng(100, 100, 255, 0, 0);

writeFileSync(join(FIXTURES_DIR, 'red-100x100-1.png'), PNG.sync.write(red1));
writeFileSync(join(FIXTURES_DIR, 'red-100x100-2.png'), PNG.sync.write(red2));
console.log('✓ Created identical red images');

// 2. Different colored images
const red = createColoredPng(100, 100, 255, 0, 0);
const blue = createColoredPng(100, 100, 0, 0, 255);

writeFileSync(join(FIXTURES_DIR, 'red-100x100.png'), PNG.sync.write(red));
writeFileSync(join(FIXTURES_DIR, 'blue-100x100.png'), PNG.sync.write(blue));
console.log('✓ Created red and blue images');

// 3. Slightly different images
const redBase = createColoredPng(100, 100, 255, 0, 0);
const redWithDiff = createSlightlyDifferentPng(100, 100);

writeFileSync(join(FIXTURES_DIR, 'red-base.png'), PNG.sync.write(redBase));
writeFileSync(join(FIXTURES_DIR, 'red-with-diff.png'), PNG.sync.write(redWithDiff));
console.log('✓ Created slightly different images');

console.log('\nAll fixtures generated successfully!');
