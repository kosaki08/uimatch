# uimatch-core

Core library for comparing Figma designs with implemented UI. Provides pixel-perfect comparison, style analysis, and quality scoring.

## Features

- **Pixel Comparison**: Visual diff using pixelmatch with configurable sensitivity
- **Style Analysis**: CSS property comparison with perceptual color difference (ΔE2000)
- **Flexible Size Handling**: Multiple strategies for dimension mismatches (strict, pad, crop, scale)
- **Content-Aware Metrics**: Normalize metrics against actual content area for intuitive scoring
- **Browser Adapter**: Playwright integration for capturing implementation screenshots
- **Type Safety**: Full TypeScript support with strict type checking

## Installation

```bash
bun add uimatch-core
```

## Quick Start

```typescript
import { compareImages, PlaywrightAdapter, captureTarget } from 'uimatch-core';

// Capture implementation screenshot
const adapter = new PlaywrightAdapter();
const captureResult = await captureTarget(adapter, {
  url: 'http://localhost:6006/?path=/story/button',
  selector: '#root button',
});

if (!captureResult.success) {
  throw captureResult.error;
}

// Compare with Figma design
const result = await compareImages({
  figmaPngB64: figmaBase64Image,
  implPngB64: captureResult.value.pngB64,
  threshold: 0.1, // pixelmatch sensitivity
  sizeMode: 'pad', // handle dimension mismatches
  contentBasis: 'intersection', // content-aware metrics
});

console.log(`Pixel difference: ${(result.pixelDiffRatio * 100).toFixed(2)}%`);
console.log(`Content-based difference: ${(result.pixelDiffRatioContent * 100).toFixed(2)}%`);
```

## Core Concepts

### Pixel Comparison

The library uses [pixelmatch](https://github.com/mapbox/pixelmatch) for visual comparison. Key metrics:

- `pixelDiffRatio`: Global pixel difference ratio (0-1)
- `pixelDiffRatioContent`: Content-only difference (recommended for quality gates)
- `diffPixelCount`: Number of differing pixels
- `diffPngB64`: Base64-encoded visual diff image

### Size Handling Modes

When design and implementation dimensions differ:

| Mode     | Behavior                       | Use Case                       |
| -------- | ------------------------------ | ------------------------------ |
| `strict` | Throw error on mismatch        | Exact pixel-perfect validation |
| `pad`    | Add letterboxing (recommended) | Development iteration          |
| `crop`   | Compare common region only     | Partial validation             |
| `scale`  | Scale smaller to match         | Quick approximation            |

**Best Practice**: Use `pad` mode with `contentBasis: 'intersection'` during development for intuitive metrics that exclude padding artifacts.

### Content-Aware Metrics

The `contentBasis` option controls how pixel difference ratios are calculated:

- `union`: Use union of both content areas (default)
- `intersection`: Use intersection only - **RECOMMENDED for pad mode**
- `figma`: Use Figma's content area only
- `impl`: Use implementation's content area only

**Example**: With a 5% layout mismatch in pad mode:

- Using `union`: May report 3-8% difference (includes padding noise)
- Using `intersection`: Reports true content difference (~1-2%)

### Style Analysis

The library extracts and compares CSS properties:

```typescript
import { buildStyleDiffs } from 'uimatch-core';

const diffs = buildStyleDiffs(implementationElements, expectedSpec, tokenMap, options);

// diffs contains:
// - selector: CSS selector for the element
// - properties: Property-level differences with actual/expected values
// - severity: 'low' | 'medium' | 'high'
// - patchHints: Suggested fixes
```

**Supported Properties**:

- Color properties (with ΔE2000 perceptual difference)
- Spacing (padding, margin, gap)
- Typography (font-size, font-weight, line-height)
- Border properties (width, radius, color)
- Shadow properties (box-shadow)

### Browser Adapter

Capture implementation screenshots with Playwright:

```typescript
import { PlaywrightAdapter, browserPool } from 'uimatch-core';

// Single capture
const adapter = new PlaywrightAdapter();
const result = await captureTarget(adapter, {
  url: 'http://localhost:6006',
  selector: '#root button',
  idleWaitMs: 150, // wait for animations
});
await adapter.close();

// Browser pooling (for multiple comparisons)
const pool = browserPool();
const browser = await pool.acquire();
const context = await browser.newContext();
const page = await context.newPage();
// ... perform captures
await context.close();
await pool.release(browser);
await pool.closeAll();
```

### Enhanced Selectors

Playwright adapter supports prefixed selectors: `role:`, `testid:`, `text:`, `xpath:`, `css:`, `dompath:`.

```typescript
selector: 'role:button[name="Submit"]';
selector: 'role:heading[level=1]';
selector: 'role:tab[selected=true]';
selector: 'testid:submit-btn';
selector: 'text:"Continue"';
selector: 'text:/continue/i';
selector: 'dompath:html/body/div[1]/main/section[2]/article';
selector: '.button'; // CSS selector (no prefix)
```

Text selectors support `[exact]` flag and escape sequences (`\n`, `\t`, `\"`, `\'`, `\\`).

Role selectors support `name`, `level`, `pressed`, `selected`, `checked`, `expanded`, `disabled`, `includeHidden` options.

### Environment Variables

- `UIMATCH_HEADLESS` - Headless mode (default: `true`)
- `UIMATCH_CHROME_CHANNEL` - Chrome channel (`chrome`, `msedge`)
- `UIMATCH_CHROME_ARGS` - Chrome arguments (space-separated)
- `UIMATCH_HTTP_TIMEOUT_MS` - Navigation timeout (default: `30000`)
- `UIMATCH_WAIT_UNTIL` - Wait strategy (`load`, `networkidle`, `domcontentloaded`)
- `UIMATCH_SELECTOR_STRICT` - Reject unknown prefixes (default: `false`)
- `UIMATCH_SELECTOR_FIRST` - Return first match (default: `false`)
- `DEBUG=uimatch:selector` - Log selector resolution
- `BASIC_AUTH_USER`, `BASIC_AUTH_PASS` - Basic authentication

## API Reference

### compareImages(input: CompareImageInput): Promise&lt;CompareImageResult&gt;

Compare two base64-encoded PNG images.

**Input**:

```typescript
interface CompareImageInput {
  figmaPngB64: string;
  implPngB64: string;
  threshold?: number; // pixelmatch threshold (0-1), default: 0.1
  includeAA?: boolean; // skip anti-aliasing detection, default: false
  sizeMode?: 'strict' | 'pad' | 'crop' | 'scale'; // default: 'strict'
  align?: ImageAlignment; // default: 'center'
  padColor?: 'auto' | PadColor; // default: 'auto'
  contentBasis?: 'union' | 'intersection' | 'figma' | 'impl'; // default: 'union'
  expectedSpec?: ExpectedSpec; // expected CSS properties
  tokenMap?: TokenMap; // design tokens
  deltaEThreshold?: number; // color difference threshold, default: 5.0
  minDeltaForDiff?: number; // minimum delta to report, default: 1.0
}
```

**Output**:

```typescript
interface CompareImageResult {
  pixelDiffRatio: number; // 0-1, global difference
  pixelDiffRatioContent?: number; // 0-1, content-only difference
  contentCoverage?: number; // 0-1, content/canvas ratio
  diffPngB64: string; // visual diff image
  diffPixelCount: number;
  totalPixels: number;
  contentPixels?: number;
  styleDiffs?: StyleDiff[];
  colorDeltaEAvg?: number; // average perceptual color difference
}
```

### captureTarget(adapter, options): Promise&lt;Result&lt;CaptureResult, CaptureError&gt;&gt;

Capture a screenshot of a web element.

**Options**:

```typescript
interface CaptureOptions {
  url: string; // target URL
  selector: string; // CSS selector
  idleWaitMs?: number; // wait after load, default: 150
  authUser?: string; // basic auth username
  authPass?: string; // basic auth password
}
```

**Result**:

```typescript
interface CaptureResult {
  pngB64: string; // base64-encoded PNG
  width: number;
  height: number;
  selector: string;
  computedStyles?: Array<{
    selector: string;
    tag: string;
    id?: string;
    class?: string;
    testid?: string;
    cssSelector?: string;
    styles: Record<string, string>;
  }>;
}
```

### buildStyleDiffs(elements, expectedSpec, tokenMap, options): StyleDiff[]

Build style differences from captured elements.

**Parameters**:

- `elements`: Array of element metadata with computed styles
- `expectedSpec`: Expected CSS property values by selector
- `tokenMap`: Design token mappings
- `options`: Diff options (deltaEThreshold, minDeltaForDiff)

**Output**:

```typescript
interface StyleDiff {
  selector: string;
  properties: Record<
    string,
    {
      actual?: string;
      expected?: string;
      expectedToken?: string;
      delta?: number; // for numeric properties
      unit?: string;
    }
  >;
  severity: 'low' | 'medium' | 'high';
  patchHints?: PatchHint[];
  meta?: {
    tag: string;
    id?: string;
    class?: string;
    testid?: string;
    cssSelector?: string;
  };
}
```

## Configuration

### Default Configuration

```typescript
import { DEFAULT_CONFIG } from 'uimatch-core';

console.log(DEFAULT_CONFIG);
// {
//   comparison: {
//     pixelmatchThreshold: 0.1,
//     acceptancePixelDiffRatio: 0.03,
//     acceptanceColorDeltaE: 3.0,
//     includeAA: false,
//   },
//   capture: {
//     defaultIdleWaitMs: 150,
//   }
// }
```

### Loading Configuration

```typescript
import { loadConfig } from 'uimatch-core';

// Load from .uimatchrc.json in current directory
const config = await loadConfig();

// Merge with custom config
import { mergeConfig } from 'uimatch-core';
const finalConfig = mergeConfig(config, {
  comparison: {
    acceptancePixelDiffRatio: 0.05,
  },
});
```

## Utilities

### Color Utilities

```typescript
import { rgbToLab, deltaE2000 } from 'uimatch-core';

// Convert RGB to Lab color space
const lab = rgbToLab({ r: 255, g: 0, b: 0 });

// Calculate perceptual color difference (ΔE2000)
const difference = deltaE2000(lab1, lab2);
// difference < 1.0: Not perceptible
// difference 1-2: Perceptible through close observation
// difference 2-10: Perceptible at a glance
// difference > 10: Colors are very different
```

### CSS Normalization

```typescript
import { parseCssColorToRgb, parseBoxShadow, normLineHeight, toPx } from 'uimatch-core';

// Parse CSS colors to RGB
const rgb = parseCssColorToRgb('#ff0000'); // { r: 255, g: 0, b: 0 }

// Parse box-shadow
const shadow = parseBoxShadow('2px 2px 4px rgba(0,0,0,0.5)');
// { offsetX: 2, offsetY: 2, blur: 4, spread: 0, color: {...}, inset: false }

// Normalize line-height
const lh = normLineHeight('1.5', '16px'); // '24px'

// Convert to pixels
const px = toPx('1.5rem', 16); // 24
```

## Error Handling

The library uses a `Result<T, E>` pattern for operations that can fail:

```typescript
import { isOk, isErr, unwrap } from 'uimatch-core';

const result = await captureTarget(adapter, options);

if (isOk(result)) {
  const value = result.value;
  console.log(`Captured ${value.width}x${value.height} image`);
} else {
  const error = result.error;
  console.error(`Capture failed: ${error.message}`);
}

// Or unwrap (throws if error)
const value = unwrap(result);
```

**Error Types**:

- `CaptureError`: Browser capture failures
- `ComparisonError`: Image comparison failures
- `ConfigError`: Configuration validation failures

## Browser Pooling

For improved performance in multiple comparisons:

```typescript
import { browserPool } from 'uimatch-core';

const pool = browserPool();

// Multiple comparisons
for (const test of tests) {
  const browser = await pool.acquire();
  const context = await browser.newContext();
  // ... perform comparison
  await context.close();
  await pool.release(browser);
}

// Cleanup
await pool.closeAll();
```

**Features**:

- Automatic browser instance reuse
- Lightweight context creation per comparison
- Reduces startup overhead from ~2s to ~500ms per iteration

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test compare.test.ts

# Watch mode
bun test --watch
```

## Type Definitions

Full TypeScript type definitions are included. Import types as needed:

```typescript
import type {
  CompareImageInput,
  CompareImageResult,
  StyleDiff,
  PatchHint,
  ExpectedSpec,
  TokenMap,
  CaptureOptions,
  CaptureResult,
  BrowserAdapter,
} from 'uimatch-core';
```

## License

See root project LICENSE.

## Related

- [uimatch-plugin](../uimatch-plugin) - Claude Code plugin integration
- [pixelmatch](https://github.com/mapbox/pixelmatch) - Underlying pixel comparison library
- [Playwright](https://playwright.dev) - Browser automation
