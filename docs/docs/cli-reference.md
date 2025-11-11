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
--outDir <path>          # Output directory (default: uimatch-output)
--name <string>          # Custom name for output files
```

#### Size Handling

```bash
--size exact             # Sizes must match exactly
--size figma             # Use Figma dimensions
--size story             # Use story dimensions
--size contain           # Fit within bounds (default)
```

#### Quality Gates

```bash
--threshold <0-1>        # Minimum similarity score (default: 0.9)
--diffThreshold <0-1>    # Pixel diff threshold (default: 0.1)
```

#### Browser Options

```bash
--headless true|false    # Run browser in headless mode
--device <name>          # Emulate device (e.g., "iPhone 12")
--viewport <WxH>         # Custom viewport size (e.g., "1920x1080")
```

### Examples

#### Basic Comparison

```bash
npx uimatch compare \
  figma=abc123:1-2 \
  story=http://localhost:3000 \
  selector="#button"
```

#### With Custom Threshold

```bash
npx uimatch compare \
  figma=https://figma.com/file/abc123?node-id=1-2 \
  story=http://localhost:6006/?path=/story/button--primary \
  selector=".storybook-button" \
  --threshold 0.98
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
  "baseUrl": "http://localhost:3000",
  "threshold": 0.95,
  "comparisons": [
    {
      "name": "Button Primary",
      "figma": "abc123:1-2",
      "story": "/components/button",
      "selector": "#button-primary"
    },
    {
      "name": "Navigation Header",
      "figma": "abc123:3-4",
      "story": "/",
      "selector": "header.nav",
      "threshold": 0.98
    }
  ]
}
```

### Options

```bash
--threshold <0-1>        # Override global threshold
--parallel <number>      # Run comparisons in parallel (default: 1)
--outDir <path>          # Output directory
```

### Example

```bash
npx uimatch suite tests/visual-regression.json --parallel 3
```

## Environment Variables

Set these in `.env` or your environment:

```bash
FIGMA_ACCESS_TOKEN=your_token_here       # Required
UIMATCH_LOG_LEVEL=info|debug|silent      # Optional
UIMATCH_HEADLESS=true|false              # Optional
```

## Exit Codes

- `0` - All comparisons passed
- `1` - One or more comparisons failed
- `2` - Invalid arguments or configuration error

## Advanced Usage

### Content Basis (Intrinsic vs Extrinsic)

Control whether to use intrinsic (natural) or extrinsic (specified) dimensions:

```bash
--contentBasis intrinsic    # Use natural element size
--contentBasis extrinsic    # Use specified size (default)
```

### Custom Anchor Plugins

Use custom selector resolution plugins:

```bash
--anchor @my-company/custom-anchor-plugin
```

See [Plugins](./plugins.md) for details on creating custom plugins.

## Tips

1. **Start with loose thresholds** (0.9) and tighten as needed
2. **Use `--headless false`** during development to see what's happening
3. **Name your comparisons** for easier debugging in CI logs
4. **Group related comparisons** in suite files for organization

## See Also

- [Concepts](./concepts.md) - Understanding anchors and quality gates
- [Troubleshooting](./troubleshooting.md) - Common issues
- [Plugins](./plugins.md) - Extending UI Match
