---
sidebar_position: 2
---

# CLI Reference

Complete reference for UI Match CLI commands and options.

## Commands Overview

UI Match provides the following commands:

- **`compare`** - Compare a single Figma design with implementation
- **`suite`** - Run multiple comparisons from a JSON suite file
- **`text-diff`** - Compare two text strings and show similarity score
- **`doctor`** - Diagnose installation and configuration issues

## `compare` Command

Compare a Figma design with your implementation.

### Basic Syntax

```bash
npx uimatch compare \
  figma=<FIGMA_REFERENCE> \
  story=<URL> \
  selector=<CSS_SELECTOR> \
  [options]
```

### Required Parameters

| Parameter  | Description                     | Example                        |
| ---------- | ------------------------------- | ------------------------------ |
| `figma`    | Figma file and node reference   | `FILE_KEY:NODE_ID` or full URL |
| `story`    | URL to compare                  | `http://localhost:3000`        |
| `selector` | CSS selector for target element | `#my-component`                |

### Common Options

#### Output Control

```bash
outDir=<path>            # Output directory (files not saved by default)
```

#### Size Handling

```bash
size=strict              # Sizes must match exactly (default)
size=pad                 # Pad smaller image with letterboxing
size=crop                # Compare common area only
size=scale               # Scale implementation to Figma size
```

#### Quality Gates

```bash
profile=component/strict # Pixel-perfect (pixelDiffRatio: 0.01, deltaE: 3.0)
profile=component/dev    # Development (pixelDiffRatio: 0.08, deltaE: 5.0)
profile=page-vs-component # Padded comparison (pixelDiffRatio: 0.12)
profile=lenient          # Prototyping (pixelDiffRatio: 0.15, deltaE: 8.0)
```

See [Quality Gate Profiles](#quality-gate-profiles) for detailed threshold settings.

#### Browser Options

```bash
viewport=<WxH>           # Custom viewport size (e.g., "1920x1080")
```

Use environment variable `UIMATCH_HEADLESS=false` to show browser window during execution.

### Examples

#### Basic Comparison

```bash
npx uimatch compare \
  figma=abc123:1-2 \
  story=http://localhost:3000 \
  selector="#button"
```

#### With Strict Quality Profile

```bash
npx uimatch compare \
  figma=https://figma.com/file/abc123?node-id=1-2 \
  story=http://localhost:6006/?path=/story/button--primary \
  selector=".storybook-button" \
  profile=component/strict
```

#### Mobile Viewport

```bash
npx uimatch compare \
  figma=abc123:1-2 \
  story=http://localhost:3000 \
  selector="#mobile-nav" \
  viewport=375x667
```

## `suite` Command

Run multiple comparisons from a JSON configuration file.

### Basic Syntax

```bash
npx uimatch suite path=<suite-file.json> [options]
```

### Suite File Format

```json
{
  "name": "Component Library Tests",
  "defaults": {
    "profile": "component/dev"
  },
  "items": [
    {
      "name": "Button Primary",
      "figma": "abc123:1-2",
      "story": "http://localhost:3000/components/button",
      "selector": "#button-primary"
    },
    {
      "name": "Navigation Header",
      "figma": "abc123:3-4",
      "story": "http://localhost:3000/",
      "selector": "header.nav"
    }
  ]
}
```

### Options

```bash
path=<suite.json>        # Path to suite file
outDir=<path>            # Output directory (default: .uimatch-suite)
concurrency=<number>     # Run comparisons in parallel (default: 4)
```

### Example

```bash
npx uimatch suite path=tests/visual-regression.json concurrency=3
```

## `text-diff` Command

Compare two text strings and show similarity score with classification.

### Basic Syntax

```bash
npx uimatch text-diff <expected> <actual> [options]
```

### Positional Arguments

| Argument   | Description                                 | Example      |
| ---------- | ------------------------------------------- | ------------ |
| `expected` | The expected text (e.g., from Figma design) | `"Sign in"`  |
| `actual`   | The actual text (e.g., from implementation) | `"SIGN  IN"` |

### Options

```bash
--case-sensitive         # Perform case-sensitive comparison (default: case-insensitive)
--threshold=<number>     # Similarity threshold (0-1, default: 0.9)
```

**Note:** Options must use `=` syntax (e.g., `--threshold=0.8`). Space-separated format (`--threshold 0.8`) is not supported.

### Output Format

Returns a JSON object with the following fields:

```typescript
{
  kind: 'exact-match' | 'whitespace-or-case-only' | 'normalized-match' | 'mismatch',
  similarity: number,              // 0-1 range
  expected: string,                // Original expected text
  actual: string,                  // Original actual text
  normalizedExpected: string,      // Normalized expected text
  normalizedActual: string,        // Normalized actual text
  equalRaw: boolean,               // True if raw texts are identical
  equalNormalized: boolean         // True if normalized texts are identical
}
```

### Classification Types

| Kind                      | Description                                                  | Example                          |
| ------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `exact-match`             | Texts are identical without any modification                 | `"Login"` vs `"Login"`           |
| `whitespace-or-case-only` | Texts differ only in whitespace, case, or NFKC normalization | `"Sign in"` vs `"SIGN  IN"`      |
| `normalized-match`        | Texts are similar after normalization (above threshold)      | `"Submit"` vs `"Submitt"` (0.92) |
| `mismatch`                | Texts are fundamentally different (below threshold)          | `"Login"` vs `"Sign in"` (0.45)  |

### Text Normalization

The comparison applies the following normalization steps:

1. **NFKC Unicode normalization** - Converts full-width characters to half-width
2. **Whitespace collapsing** - Collapses consecutive whitespace into single space
3. **Trim** - Removes leading/trailing whitespace
4. **Case normalization** - Converts to lowercase (unless `--case-sensitive` is used)

### Examples

#### Basic Comparison

```bash
npx uimatch text-diff "Sign in" "SIGN  IN"
```

Output:

```json
{
  "kind": "whitespace-or-case-only",
  "similarity": 1.0,
  "equalRaw": false,
  "equalNormalized": true
}
```

#### Case-Sensitive Comparison

```bash
npx uimatch text-diff "Submit" "submit" --case-sensitive
```

Output:

```json
{
  "kind": "whitespace-or-case-only",
  "similarity": 1.0,
  "equalRaw": false,
  "equalNormalized": false
}
```

#### With Custom Threshold

```bash
npx uimatch text-diff "Hello World" "Helo World" --threshold=0.6
```

Output:

```json
{
  "kind": "normalized-match",
  "similarity": 0.91,
  "equalRaw": false,
  "equalNormalized": false
}
```

#### Full-Width Character Handling

```bash
npx uimatch text-diff "Button123" "Button１２３"
```

Output:

```json
{
  "kind": "whitespace-or-case-only",
  "similarity": 1.0,
  "equalRaw": false,
  "equalNormalized": true
}
```

### Use Cases

- **Text label validation** - Compare Figma text labels with implementation
- **Localization testing** - Verify translated text maintains similarity
- **Typography debugging** - Identify subtle text differences (case, whitespace, unicode)
- **Component testing** - Validate text content in UI components

### Programmatic Usage

For programmatic use, import `compareText` from `@uimatch/core`:

```typescript
import { compareText } from '@uimatch/core';

const result = compareText('Expected', 'Actual', {
  caseSensitive: false,
  similarityThreshold: 0.9,
});

console.log(result.kind); // 'exact-match' | 'whitespace-or-case-only' | ...
console.log(result.similarity); // 0.0 - 1.0
```

See [API Reference](./api-reference.md) for details.

## Environment Variables

Set these in `.env` or your environment:

```bash
FIGMA_ACCESS_TOKEN=your_token_here       # Required for Figma API access
UIMATCH_LOG_LEVEL=info|debug|silent      # Logging verbosity (default: info)
UIMATCH_HEADLESS=true|false              # Playwright headless mode (default: true)
                                          # Set to 'false' to show browser window
                                          # Applies to compare/suite/doctor commands
```

## Exit Codes

- `0` - All comparisons passed
- `1` - One or more comparisons failed
- `2` - Invalid arguments or configuration error

## Advanced Usage

### Content Basis

Control which area to use for calculating pixel difference ratio:

```bash
contentBasis=union          # Union of both content areas (default)
contentBasis=intersection   # Intersection of both areas (recommended for pad mode)
contentBasis=figma          # Use Figma's content area only
contentBasis=impl           # Use implementation's content area only
```

**Best Practice:** Use `intersection` with `size=pad` to exclude letterboxing from metrics.

### Custom Anchor Plugins

Use custom selector resolution plugins:

```bash
selectorsPlugin=@my-company/custom-anchor-plugin
```

See [Plugins](./plugins.md) for details on creating custom plugins.

## Quality Gate Profiles

UI Match uses quality gate profiles to manage thresholds instead of individual CLI flags.

| Profile             | Use Case                 | pixelDiffRatio | deltaE | Description               |
| ------------------- | ------------------------ | -------------- | ------ | ------------------------- |
| `component/strict`  | Design system components | 0.01 (1%)      | 3.0    | Pixel-perfect comparison  |
| `component/dev`     | Development workflow     | 0.08 (8%)      | 5.0    | Relaxed for iteration     |
| `page-vs-component` | Padded comparisons       | 0.12 (12%)     | 5.0    | Accounts for letterboxing |
| `lenient`           | Prototyping              | 0.15 (15%)     | 8.0    | Very relaxed thresholds   |
| `custom`            | Custom settings          | -              | -      | Uses `.uimatchrc.json`    |

### Using Profiles

```bash
# Pixel-perfect comparison
npx uimatch compare figma=... story=... selector=... profile=component/strict

# Development workflow
npx uimatch compare figma=... story=... selector=... profile=component/dev
```

### Custom Configuration

For fine-grained control, create `.uimatchrc.json`:

```json
{
  "comparison": {
    "acceptancePixelDiffRatio": 0.01,
    "acceptanceColorDeltaE": 3.0
  }
}
```

## Tips

1. **Start with lenient profile** (`profile=lenient`) and tighten as needed
2. **Use `UIMATCH_HEADLESS=false`** during development to see browser window
3. **Name your comparisons** for easier debugging in CI logs
4. **Group related comparisons** in suite files for organization

## See Also

- [Concepts](./concepts.md) - Understanding anchors and quality gates
- [Troubleshooting](./troubleshooting.md) - Common issues
- [Plugins](./plugins.md) - Extending UI Match
