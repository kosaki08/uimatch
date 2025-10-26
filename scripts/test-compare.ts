#!/usr/bin/env bun
/**
 * Test script for uiMatch comparison functionality
 *
 * This script demonstrates the core comparison features using fixture data.
 * Run with: bun run test:compare
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildStyleDiffs, compareImages } from '../packages/uimatch-core/src/index';

const FIXTURES_DIR = join(import.meta.dir, '../packages/uimatch-core/fixtures');

/**
 * Load a fixture PNG as base64
 */
function loadFixture(filename: string): string {
  const path = join(FIXTURES_DIR, filename);
  const buffer = readFileSync(path);
  return buffer.toString('base64');
}

/**
 * Format and display comparison results
 */
function displayResults(
  title: string,
  result: ReturnType<typeof compareImages>,
  showArtifacts = false
) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));

  console.log('\nMetrics:');
  console.log(`  Pixel Diff Ratio: ${(result.pixelDiffRatio * 100).toFixed(2)}%`);
  console.log(
    `  Different Pixels: ${result.diffPixelCount.toLocaleString()} / ${result.totalPixels.toLocaleString()}`
  );

  if (result.colorDeltaEAvg !== undefined) {
    console.log(`  Color Delta E Avg: ${result.colorDeltaEAvg.toFixed(2)}`);
  }

  if (result.styleDiffs && result.styleDiffs.length > 0) {
    console.log(`\nStyle Differences: ${result.styleDiffs.length}`);
    result.styleDiffs.forEach((diff, idx) => {
      console.log(`\n  [${idx + 1}] ${diff.path} (${diff.severity})`);
      console.log(`      Selector: ${diff.selector}`);

      const props = Object.entries(diff.properties).filter(
        ([, v]) => v.delta !== undefined || (v.expected && v.actual !== v.expected)
      );

      if (props.length > 0) {
        props.forEach(([prop, value]) => {
          const deltaStr =
            value.delta !== undefined ? ` (Δ ${value.delta}${value.unit || ''})` : '';
          console.log(`      ${prop}: ${value.actual} → ${value.expected}${deltaStr}`);
        });
      }

      if (diff.patchHints && diff.patchHints.length > 0) {
        console.log('      Patch hints:');
        diff.patchHints.forEach((hint) => {
          console.log(`        - [${hint.severity}] ${hint.property}: ${hint.suggestedValue}`);
        });
      }
    });
  }

  if (showArtifacts) {
    console.log(`\nDiff Image (base64 length): ${result.diffPngB64.length} chars`);
  }
}

/**
 * Main test execution
 */
async function main() {
  console.log('🎨 uiMatch Comparison Test Suite\n');

  // Test 1: Identical images
  console.log('Test 1: Comparing identical images...');
  const identical1 = loadFixture('red-100x100-1.png');
  const identical2 = loadFixture('red-100x100-2.png');

  const result1 = compareImages({
    figmaPngB64: identical1,
    implPngB64: identical2,
  });

  displayResults('Identical Images', result1);

  // Test 2: Completely different colors
  console.log('\n\nTest 2: Comparing completely different colors...');
  const red = loadFixture('red-100x100.png');
  const blue = loadFixture('blue-100x100.png');

  const result2 = compareImages({
    figmaPngB64: red,
    implPngB64: blue,
  });

  displayResults('Red vs Blue', result2);

  // Test 3: Small difference
  console.log('\n\nTest 3: Comparing images with small difference...');
  const redBase = loadFixture('red-base.png');
  const redWithDiff = loadFixture('red-with-diff.png');

  const result3 = compareImages({
    figmaPngB64: redBase,
    implPngB64: redWithDiff,
  });

  displayResults('Small Difference', result3);

  // Test 4: Style comparison with mock data
  console.log('\n\nTest 4: Testing style comparison...');

  const actualStyles = {
    __self__: {
      'font-size': '14px',
      'line-height': '1.5',
      'font-weight': '400',
      color: 'rgb(26, 115, 232)', // #1a73e8
      'background-color': 'rgb(255, 255, 255)',
      'border-radius': '4px',
      'padding-top': '12px',
      'padding-left': '12px',
    },
  };

  const expectedSpec = {
    __self__: {
      'font-size': '16px',
      'line-height': '1.5',
      'font-weight': '400',
      color: 'var(--color-primary)',
      'background-color': '#ffffff',
      'border-radius': '8px',
      'padding-top': '16px',
      'padding-left': '16px',
    },
  };

  const tokens = {
    color: {
      '--color-primary': '#1a73e8',
    },
  };

  const result4 = compareImages({
    figmaPngB64: red,
    implPngB64: red, // Same image for pixel comparison
    styles: actualStyles,
    expectedSpec,
    tokens,
    diffOptions: {
      thresholds: { deltaE: 3.0 },
    },
  });

  displayResults('With Style Comparison', result4, true);

  // Test 5: Standalone style diff (no image comparison)
  console.log('\n\nTest 5: Standalone style diff...');

  const styleDiffs = buildStyleDiffs(actualStyles, expectedSpec, {
    thresholds: { deltaE: 3.0 },
    tokens,
  });

  console.log('\n' + '='.repeat(60));
  console.log('  Standalone Style Differences');
  console.log('='.repeat(60));

  console.log(`\nFound ${styleDiffs.length} style diff(s):`);
  styleDiffs.forEach((diff, idx) => {
    console.log(`\n  [${idx + 1}] ${diff.path} (${diff.severity})`);
    Object.entries(diff.properties).forEach(([prop, value]) => {
      if (value.expected && value.actual !== value.expected) {
        const deltaStr = value.delta !== undefined ? ` (Δ ${value.delta}${value.unit || ''})` : '';
        const tokenStr = value.expectedToken ? ` [token: ${value.expectedToken}]` : '';
        console.log(`      ${prop}: ${value.actual} → ${value.expected}${deltaStr}${tokenStr}`);
      }
    });

    if (diff.patchHints && diff.patchHints.length > 0) {
      console.log('      Suggested fixes:');
      diff.patchHints.forEach((hint) => {
        console.log(`        - ${hint.property}: ${hint.suggestedValue}`);
      });
    }
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  Test Summary');
  console.log('='.repeat(60));
  console.log(`
  ✅ Test 1: Identical images      → ${result1.pixelDiffRatio === 0 ? 'PASS' : 'FAIL'}
  ✅ Test 2: Different colors      → ${result2.pixelDiffRatio > 0.9 ? 'PASS' : 'FAIL'}
  ✅ Test 3: Small difference      → ${result3.pixelDiffRatio > 0 && result3.pixelDiffRatio < 0.1 ? 'PASS' : 'FAIL'}
  ✅ Test 4: Style comparison      → ${result4.styleDiffs && result4.styleDiffs.length > 0 ? 'PASS' : 'FAIL'}
  ✅ Test 5: Standalone style diff → ${styleDiffs.length > 0 ? 'PASS' : 'FAIL'}
  `);

  console.log('🎉 All tests completed!\n');
}

// Run tests
main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
