---
sidebar_position: 2
---

# CLI Reference

Complete reference for UI Match CLI commands and options.

## Commands Overview

UI Match provides two main commands:

- **`compare`** - Compare a single Figma design with implementation
- **`suite`** - Run multiple comparisons from a JSON suite file

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
  --viewport 375x667
```

## `suite` Command

Run multiple comparisons from a JSON configuration file.

### Basic Syntax

```bash
npx uimatch suite <suite-file.json> [options]
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
--anchor @my-company/custom-anchor-plugin
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
