#!/usr/bin/env bun
/**
 * Zero-config runner for uiMatch using current Figma selection
 * Usage:
 *   bun run uimatch:current -- target=<file|dir|stories|url> [selector="#storybook-root nav"] [figma=current]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { uiMatchCompare } from 'uimatch-plugin';

/**
 * Get CLI argument value by key
 */
function arg(k: string, d?: string): string | undefined {
  const v = process.argv.slice(2).find((a) => a.startsWith(k + '='));
  return v ? v.slice(k.length + 1) : d;
}

/**
 * Check if string is a URL
 */
function isUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert string to slug format
 */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Detect Storybook story URL from file or directory path
 */
function detectStoryFromFile(p: string): { url: string; selector: string } {
  // Determine directory to search
  const isFile = statSync(p).isFile();
  const dir = isFile ? dirname(p) : p;

  // Find *.stories.* file in directory
  const files = readdirSync(dir);
  const cand = files.find((f) => /\.stories\.(t|j)sx?$/.test(f));
  if (!cand) {
    throw new Error(`No stories file found in directory: ${dir}`);
  }

  // Parse story metadata
  const src = readFileSync(join(dir, cand), 'utf-8');
  const titleMatch = /title\s*:\s*['"]([^'"]+)['"]/m.exec(src);
  const title = titleMatch?.[1] ?? basename(dir);
  const firstMatch = /export\s+const\s+([A-Za-z0-9_]+)/m.exec(src);
  const first = firstMatch?.[1] ?? 'Default';

  // Generate Storybook URL
  const storyId = `${slug(title)}--${slug(first)}`;
  const url = `http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`;
  return { url, selector: '#storybook-root nav' };
}

/**
 * Generate red overlay image (implementation + red diff highlights)
 */
function generateOverlay(implPngB64: string, diffPngB64: string): Buffer {
  const impl = PNG.sync.read(Buffer.from(implPngB64, 'base64'));
  const diff = PNG.sync.read(Buffer.from(diffPngB64, 'base64'));
  const overlay = new PNG({ width: impl.width, height: impl.height });

  for (let i = 0; i < impl.data.length; i += 4) {
    const r = impl.data[i];
    const g = impl.data[i + 1];
    const b = impl.data[i + 2];
    const a = impl.data[i + 3];

    // Check if diff pixel is non-zero (indicates difference)
    const dr = diff.data[i];
    const dg = diff.data[i + 1];
    const db = diff.data[i + 2];
    const hasDiff = (dr | dg | db) !== 0;

    // Apply red highlight to diff pixels
    overlay.data[i] = hasDiff ? 255 : r;
    overlay.data[i + 1] = hasDiff ? Math.round(g * 0.65) : g;
    overlay.data[i + 2] = hasDiff ? Math.round(b * 0.65) : b;
    overlay.data[i + 3] = a;
  }

  return PNG.sync.write(overlay);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const target = arg('target');
  if (!target) {
    console.error(
      'Usage: bun run uimatch:current -- target=<file|dir|stories|url> [selector=...] [figma=current]'
    );
    process.exit(2);
  }

  const selector = arg('selector', '#storybook-root nav')!;
  const figma = arg('figma', 'current') as 'current' | string;

  // Resolve target to URL
  let story: string;
  if (isUrl(target)) {
    story = target;
  } else {
    try {
      story = detectStoryFromFile(target).url;
    } catch (e) {
      console.error('Error: Could not detect Storybook URL from path.');
      console.error('Please provide a direct URL instead:');
      console.error('  bun run uimatch:current -- target=http://localhost:6006/...');
      process.exit(2);
    }
  }

  // Display comparison settings
  console.log('🎨 Running uiMatch comparison...');
  console.log(`  Figma: ${figma}`);
  console.log(`  Story: ${story}`);
  console.log(`  Selector: ${selector}\n`);

  // Execute comparison
  try {
    const result = await uiMatchCompare({
      figma,
      story,
      selector,
      emitArtifacts: true,
    });

    // Save artifacts
    if (result.report.artifacts) {
      console.log('💾 Saving artifacts...');
      writeFileSync(
        '/tmp/uimatch-figma.png',
        Buffer.from(result.report.artifacts.figmaPngB64, 'base64')
      );
      writeFileSync(
        '/tmp/uimatch-impl.png',
        Buffer.from(result.report.artifacts.implPngB64, 'base64')
      );
      writeFileSync(
        '/tmp/uimatch-diff.png',
        Buffer.from(result.report.artifacts.diffPngB64, 'base64')
      );

      // Generate and save overlay
      const overlay = generateOverlay(
        result.report.artifacts.implPngB64,
        result.report.artifacts.diffPngB64
      );
      writeFileSync('/tmp/uimatch-overlay.png', overlay);

      console.log('   • Figma design:   /tmp/uimatch-figma.png');
      console.log('   • Implementation: /tmp/uimatch-impl.png');
      console.log('   • Diff (visual):  /tmp/uimatch-diff.png');
      console.log('   • Overlay (red):  /tmp/uimatch-overlay.png');
      console.log('');
    }

    console.log(result.summary);
    if (!result.report.qualityGate?.pass) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Comparison failed:');
    console.error((error as Error)?.message ?? error);

    if ((error as Error)?.message?.includes('current selection')) {
      console.error('\n💡 Troubleshooting:');
      console.error('  1. Open Figma Desktop App');
      console.error('  2. Select the component you want to compare');
      console.error("  3. Make sure it's not a component from another file");
      console.error('  4. Run the command again');
    }

    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Error:', (e as Error)?.message ?? e);
  process.exit(1);
});
