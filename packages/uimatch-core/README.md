# @uimatch/core

Core library for comparing Figma designs with implemented UI. Provides pixel-perfect comparison, style analysis, and quality scoring.

## Features

- **Pixel Comparison**: Visual diff using pixelmatch with configurable sensitivity
- **Style Analysis**: CSS property comparison with perceptual color difference (ΔE2000)
- **Flexible Size Handling**: Multiple strategies for dimension mismatches (strict, pad, crop, scale)
- **Content-Aware Metrics**: Normalize metrics against actual content area for intuitive scoring
- **Browser Adapter**: Playwright integration for capturing implementation screenshots
- **Type Safety**: Full TypeScript support with strict type checking

## Installation

> **Note**: This is an internal monorepo package bundled into `@uimatch/cli`. It is not published to npm (`private: true` in package.json).

**For normal usage**: Install `@uimatch/cli` instead:

```bash
npm install -g @uimatch/cli
```

**For monorepo development**: This package is automatically linked via pnpm workspace protocol:

```bash
# From monorepo root
pnpm install
pnpm build
```

## Quick Start

> **Note**: This package is internal. For normal usage, use `@uimatch/cli` instead. See Installation section above.

**For monorepo development only:**

```typescript
import { compareImages, captureTarget } from '@uimatch/core';

// Capture implementation screenshot
const captureResult = await captureTarget({
  url: 'http://localhost:6006/?path=/story/button',
  selector: '#root button',
});

// Compare with Figma design
const result = await compareImages({
  figmaPngB64: figmaBase64Image,
  implPngB64: captureResult.implPng.toString('base64'),
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
import { buildStyleDiffs } from '@uimatch/core';

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

### Browser Capture

Capture implementation screenshots with internal browser pooling:

```typescript
import { captureTarget } from '@uimatch/core';

// Single capture with automatic browser pooling
const result = await captureTarget({
  url: 'http://localhost:6006',
  selector: '#root button',
  idleWaitMs: 150, // wait for animations
  reuseBrowser: true, // default: automatic browser reuse
});

// Browser is automatically managed and reused across captures
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
- `DEBUG=uimatch:*` / `DEBUG=uimatch:selector` - Debug logging
- `UIMATCH_LOG_LEVEL` - `silent` | `error` | `warn` | `info` | `debug`
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

### captureTarget(options): Promise&lt;CaptureResult&gt;

Capture a screenshot of a web element with automatic browser pooling.

**Options**:

```typescript
interface CaptureOptions {
  url: string; // target URL
  selector: string; // CSS selector (supports enhanced selectors)
  childSelector?: string; // optional child selector
  viewport?: { width: number; height: number }; // viewport size
  dpr?: number; // device pixel ratio, default: 1
  idleWaitMs?: number; // wait after load, default: 150
  reuseBrowser?: boolean; // enable browser pooling, default: true
  basicAuth?: { username: string; password: string }; // basic auth credentials
}
```

**Result**:

```typescript
interface CaptureResult {
  implPng: Buffer; // PNG screenshot as Buffer
  styles: Record<string, Record<string, string>>; // CSS styles keyed by selector
  box: { x: number; y: number; width: number; height: number }; // Element bounding box
  childBox?: { x: number; y: number; width: number; height: number }; // Child element box (optional)
  meta?: Record<string, ElementMeta>; // DOM element metadata (optional)
}
```

**Usage Note**: Convert `implPng` to base64 for `compareImages`:

```typescript
const result = await compareImages({
  implPngB64: captureResult.implPng.toString('base64'),
  // ... other options
});
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
import { DEFAULT_CONFIG } from '@uimatch/core';

console.log(DEFAULT_CONFIG);
// {
//   comparison: {
//     pixelmatchThreshold: 0.1,
//     acceptancePixelDiffRatio: 0.01,
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
import { loadConfig } from '@uimatch/core';

// Load from .uimatchrc.json in current directory
const config = await loadConfig();

// Merge with custom config
import { mergeConfig } from '@uimatch/core';
const finalConfig = mergeConfig(config, {
  comparison: {
    acceptancePixelDiffRatio: 0.05,
  },
});
```

## Utilities

### Text Comparison

Compare two text strings to detect matching, normalization differences, or mismatches.

```typescript
import { compareText } from '@uimatch/core';

// Compare Figma text with DOM textContent
const figmaText = 'Sign in';
const domText = element.textContent ?? '';

const diff = compareText(figmaText, domText, {
  caseSensitive: false, // default: false
  similarityThreshold: 0.9, // default: 0.9 (0-1 range)
});

console.log(diff.kind); // 'exact-match' | 'whitespace-or-case-only' | 'normalized-match' | 'mismatch'
console.log(diff.similarity); // similarity score (0-1)
```

**Options**:

```typescript
interface TextCompareOptions {
  caseSensitive?: boolean; // Enable case-sensitive comparison (default: false)
  similarityThreshold?: number; // Similarity threshold for match (0-1, default: 0.9)
}
```

**Result**:

```typescript
interface TextDiff {
  kind: 'exact-match' | 'whitespace-or-case-only' | 'normalized-match' | 'mismatch';
  similarity: number; // similarity score (0-1)
  normalizedExpected: string; // normalized expected text
  normalizedActual: string; // normalized actual text
}
```

**Match Types**:

- `exact-match`: Completely identical strings (raw comparison)
- `whitespace-or-case-only`: Same after normalization (NFKC, whitespace, case)
- `normalized-match`: Similar enough to pass threshold (default 0.9)
- `mismatch`: Different strings below threshold

**Normalization**:

The comparison applies NFKC normalization, trims whitespace, collapses consecutive spaces, and optionally normalizes case. The similarity score combines:

- Position-based prefix matching (0.2 weight)
- Token overlap ratio (0.8 weight)

**Examples**:

```typescript
// Exact match
compareText('Submit', 'Submit');
// { kind: 'exact-match', similarity: 1.0, ... }

// Whitespace/case difference
compareText('Sign  in', 'sign in');
// { kind: 'whitespace-or-case-only', similarity: 1.0, ... }

// Typo with high similarity
compareText('Submit', 'Submt', { similarityThreshold: 0.5 });
// { kind: 'normalized-match', similarity: ~0.7, ... }

// Complete mismatch
compareText('Login', 'Register');
// { kind: 'mismatch', similarity: ~0.0, ... }
```

**CLI Usage**:

```bash
# Compare two text strings
uimatch text-diff "Sign in" "Sign  in"

# Case-sensitive comparison
uimatch text-diff "Submit" "submit" --case-sensitive

# Custom threshold
uimatch text-diff "Hello" "Helo" --threshold=0.6
```

### Color Utilities

```typescript
import { rgbToLab, deltaE2000 } from '@uimatch/core';

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
import { parseCssColorToRgb, parseBoxShadow, normLineHeight, toPx } from '@uimatch/core';

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

The library throws exceptions for errors. Use try-catch for error handling:

```typescript
import { captureTarget } from '@uimatch/core';

try {
  const result = await captureTarget({
    url: 'http://localhost:6006',
    selector: '#root button',
  });
  console.log(`Captured ${result.width}x${result.height} image`);
} catch (error) {
  console.error(`Capture failed: ${error.message}`);
}
```

**Error Types**:

- Standard JavaScript `Error` for capture failures
- Validation errors for invalid configuration
- Playwright errors for browser-related issues

## Browser Pooling

Browser pooling is automatically managed internally when using `captureTarget` with `reuseBrowser: true` (default):

```typescript
import { captureTarget } from '@uimatch/core';

// Multiple comparisons with automatic browser reuse
for (const test of tests) {
  const result = await captureTarget({
    url: test.url,
    selector: test.selector,
    reuseBrowser: true, // default: automatic browser reuse
  });
  // Browser is automatically pooled and reused
}

// Browser cleanup is automatic on process exit
```

**Features**:

- Automatic browser instance reuse (no manual pool management)
- Lightweight context creation per comparison
- Reduces startup overhead from ~2s to ~500ms per iteration
- Automatic cleanup on process exit

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
} from '@uimatch/core';
```

## Distribution

Not published independently (`private: true`). Bundled into `@uimatch/cli`.

## License

MIT

## Related

- [@uimatch/cli](../@uimatch/cli) - Claude Code plugin integration
- [pixelmatch](https://github.com/mapbox/pixelmatch) - Underlying pixel comparison library
- [Playwright](https://playwright.dev) - Browser automation
