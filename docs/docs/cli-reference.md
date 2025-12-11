---
sidebar_position: 2
---

# CLI Reference

Complete reference for uiMatch CLI commands and options.

## Commands Overview

uiMatch provides the following commands:

- **`compare`** - Compare a single Figma design with implementation
- **`suite`** - Run multiple comparisons from a JSON suite file
- **`text-diff`** - Compare two text strings and show similarity score
- **`doctor`** - Diagnose installation and configuration issues
- **`version`** - Display CLI version information

## `compare` Command

Compare a Figma design with your implementation.

### Basic Syntax

**Note:** This assumes `@uimatch/cli` is already installed (globally or as a dev dependency).

```shell
npx @uimatch/cli compare \
  figma=<FIGMA_REFERENCE> \
  story=<URL> \
  selector=<CSS_SELECTOR> \
  [options]
```

### Run Once Without Installing

If you want to try uiMatch without adding it to your project:

```shell
npx -p @uimatch/cli uimatch compare \
  figma=<FIGMA_REFERENCE> \
  story=<URL> \
  selector=<CSS_SELECTOR> \
  [options]
```

This explicitly tells `npx` which package to install (`@uimatch/cli`) and which binary to run (`uimatch`).

### Required Parameters

| Parameter  | Description                     | Example                        |
| ---------- | ------------------------------- | ------------------------------ |
| `figma`    | Figma file and node reference   | `FILE_KEY:NODE_ID` or full URL |
| `story`    | URL to compare                  | `http://localhost:3000`        |
| `selector` | CSS selector for target element | `#my-component`                |

### Common Options

#### Output Control

```shell
outDir=<path>            # Output directory (files not saved by default)
```

#### Size Handling

```shell
size=strict              # Sizes must match exactly (default)
size=pad                 # Pad smaller image with letterboxing
size=crop                # Compare common area only
size=scale               # Scale implementation to Figma size
```

#### Quality Gates

```shell
profile=component/strict # Pixel-perfect (pixelDiffRatio: 0.01, deltaE: 3.0)
profile=component/dev    # Development (pixelDiffRatio: 0.08, deltaE: 5.0)
profile=page-vs-component # Padded comparison (pixelDiffRatio: 0.12)
profile=lenient          # Prototyping (pixelDiffRatio: 0.15, deltaE: 8.0)

# Fine-grained thresholds (overrides profile)
areaGapCritical=<0..1>   # Critical area gap threshold (default: 0.15)
areaGapWarning=<0..1>    # Warning area gap threshold (default: 0.05)
```

See [Quality Gate Profiles](#quality-gate-profiles) for detailed threshold settings.

#### Browser Options

```shell
viewport=<WxH>           # Custom viewport size (e.g., "1920x1080")
```

Use environment variable `UIMATCH_HEADLESS=false` to show browser window during execution.

#### Text Matching (Experimental)

Enable text content comparison alongside pixel-based comparison to detect copy differences, typos, and missing text.

```shell
text=true                          # Enable text matching (default: false)
textMode=self|descendants          # Text collection scope (default: self)
                                   #   self: Element's own text only
                                   #   descendants: Include child elements
textNormalize=none|nfkc|nfkc_ws    # Normalization mode (default: nfkc_ws)
                                   #   none: No normalization
                                   #   nfkc: Unicode NFKC normalization
                                   #   nfkc_ws: NFKC + whitespace collapsing
textCase=sensitive|insensitive     # Case sensitivity (default: insensitive)
textMatch=exact|contains|ratio     # Matching mode (default: ratio)
                                   #   exact: Exact match required
                                   #   contains: Substring matching
                                   #   ratio: Similarity scoring
textMinRatio=0..1                  # Minimum similarity threshold (default: 0.98)
                                   # Only applies when textMatch=ratio
```

**Note**: Text matching results appear in the `textMatch` section of `report.json` when `outDir` is specified.

See [Text Matching](./concepts.md#text-matching) for detailed information on normalization, similarity scoring, and use cases.

### Examples

#### Basic Comparison

```shell
npx @uimatch/cli compare \
  figma=abc123:1-2 \
  story=http://localhost:3000 \
  selector="#button"
```

#### With Strict Quality Profile

```shell
npx @uimatch/cli compare \
  figma=https://figma.com/file/abc123?node-id=1-2 \
  story=http://localhost:6006/?path=/story/button--primary \
  selector=".storybook-button" \
  profile=component/strict
```

#### Mobile Viewport

```shell
npx @uimatch/cli compare \
  figma=abc123:1-2 \
  story=http://localhost:3000 \
  selector="#mobile-nav" \
  viewport=375x667
```

#### With Text Matching

Compare both visual appearance and text content to detect typos and copy differences:

```shell
npx @uimatch/cli compare \
  figma=abc123:1-2 \
  story=http://localhost:6006/?path=/story/accordion--default \
  selector="[data-testid='accordion']" \
  text=true \
  textMode=descendants \
  textMinRatio=0.95 \
  outDir=./comparison-results
```

Results include a `textMatch` section in `report.json`:

```json
{
  "textMatch": {
    "enabled": true,
    "ratio": 0.42,
    "equal": false,
    "details": {
      "missing": ["accordion", "vertically", "stacked"],
      "extra": ["is", "it", "accessible"]
    }
  }
}
```

## `suite` Command

Run multiple comparisons from a JSON configuration file.

### Basic Syntax

```shell
npx @uimatch/cli suite path=<suite-file.json> [options]
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

```shell
path=<suite.json>        # Path to suite file
outDir=<path>            # Output directory (default: .uimatch-suite)
concurrency=<number>     # Run comparisons in parallel (default: 4)
```

### Example

```shell
npx @uimatch/cli suite path=tests/visual-regression.json concurrency=3
```

## `text-diff` Command

Compare two text strings and show similarity score with classification.

### Basic Syntax

```shell
npx @uimatch/cli text-diff <expected> <actual> [options]
```

### Positional Arguments

| Argument   | Description                                 | Example      |
| ---------- | ------------------------------------------- | ------------ |
| `expected` | The expected text (e.g., from Figma design) | `"Sign in"`  |
| `actual`   | The actual text (e.g., from implementation) | `"SIGN  IN"` |

### Options

```shell
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

```shell
npx @uimatch/cli text-diff "Sign in" "SIGN  IN"
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

```shell
npx @uimatch/cli text-diff "Submit" "submit" --case-sensitive
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

```shell
npx @uimatch/cli text-diff "Hello World" "Helo World" --threshold=0.6
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

```shell
npx @uimatch/cli text-diff "Button123" "Button１２３"
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

## `version` Command

Display the current version of the CLI.

### Basic Syntax

```shell
npx @uimatch/cli version
```

### Alternatives

You can also use standard flags:

```shell
npx @uimatch/cli --version
# or
npx @uimatch/cli -v
```

## Environment Variables

Set these in `.env` or your environment:

```shell
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

```shell
contentBasis=union          # Union of both content areas (default)
contentBasis=intersection   # Intersection of both areas (recommended for pad mode)
contentBasis=figma          # Use Figma's content area only
contentBasis=impl           # Use implementation's content area only
```

**Best Practice:** Use `intersection` with `size=pad` to exclude letterboxing from metrics.

### Custom Anchor Plugins

Use custom selector resolution plugins:

```shell
selectorsPlugin=@my-company/custom-anchor-plugin
```

See [Plugins](./plugins.md) for details on creating custom plugins.

## Quality Gate Profiles

uiMatch uses quality gate profiles to manage thresholds instead of individual CLI flags.

| Profile             | Use Case                 | pixelDiffRatio | deltaE | Description                   |
| ------------------- | ------------------------ | -------------- | ------ | ----------------------------- |
| `component/strict`  | Design system components | 0.01 (1%)      | 3.0    | Pixel-perfect comparison      |
| `component/dev`     | Development workflow     | 0.08 (8%)      | 5.0    | Relaxed for iteration         |
| `page-vs-component` | Padded comparisons       | 0.12 (12%)     | 5.0    | Accounts for letterboxing     |
| `page/text-doc`     | Text-heavy pages         | 0.20 (20%)     | 6.0    | Terms, privacy, documentation |
| `lenient`           | Prototyping              | 0.15 (15%)     | 8.0    | Very relaxed thresholds       |
| `custom`            | Custom settings          | -              | -      | Uses `.uimatchrc.json`        |

### Using Profiles

```shell
# Pixel-perfect comparison
npx @uimatch/cli compare figma=... story=... selector=... profile=component/strict

# Development workflow
npx @uimatch/cli compare figma=... story=... selector=... profile=component/dev

# Text-heavy pages (Terms, Privacy Policy, etc.)
npx @uimatch/cli compare figma=... story=... selector=... profile=page/text-doc
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
- [Plugins](./plugins.md) - Extending uiMatch
