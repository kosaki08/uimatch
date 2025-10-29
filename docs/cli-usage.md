# CLI Usage

## Commands

- `compare` - Compare single Figma design with implementation
- `suite` - Run multiple comparisons from JSON suite file

## Compare Command

Compare Figma design with implementation using UIMatch Core.

### Basic Usage

```bash
bun run packages/uimatch-plugin/src/cli/compare.ts \
  figma=<FILE:NODE> \
  story=<URL> \
  selector=<CSS_SELECTOR> \
  [options]
```

### Required Parameters

- `figma` - Figma reference in format `fileKey:nodeId` or full URL
- `story` - Target URL to compare (e.g., `http://localhost:3000`)
- `selector` - CSS selector for element to capture

### Key Options

- `size=<mode>` - Size handling: `strict|pad|crop|scale` (default: `strict`)
- `contentBasis=<mode>` - Content area basis: `union|intersection|figma|impl` (default: `union`)
- `outDir=<path>` - Save artifacts to directory
- `bootstrap=<bool>` - Auto-generate expectedSpec from Figma node
- `viewport=<WxH>` - Viewport size (e.g., `1584x1104`)
- `dpr=<number>` - Device pixel ratio (default: `2`)

### Environment Variables

Required in `.env`:
```bash
FIGMA_ACCESS_TOKEN=figd_xxx  # Figma Personal Access Token
```

### Example

```bash
bun run packages/uimatch-plugin/src/cli/compare.ts \
  figma="eUyFpkxbluuyFVn0mAmJSB:13-1023" \
  story="http://localhost:3000" \
  selector="main > div > div:nth-child(2)" \
  size=pad \
  contentBasis=figma \
  outDir=.uimatch-out/comparison \
  bootstrap=true
```

### Output

Generates artifacts in `outDir`:
- `figma.png` - Figma design screenshot
- `impl.png` - Implementation screenshot
- `diff.png` - Visual diff with red highlights
- `report.json` - Detailed metrics

### Metrics

- **pixelDiffRatio** - Global pixel difference (0-1)
- **pixelDiffRatioContent** - Content-only pixel difference (more accurate)
- **contentCoverage** - Percentage of canvas that is content
- **colorDeltaEAvg** - Average color difference (when styles captured)

## Suite Command

Run multiple comparisons from JSON suite file for batch testing.

### Basic Usage

```bash
bun run packages/uimatch-plugin/src/cli/suite.ts \
  path=<suite.json> \
  [outDir=.uimatch-suite] \
  [concurrency=4] \
  [verbose=false]
```

### Parameters

- `path` - Path to JSON suite file (required)
- `outDir` - Output directory (default: `.uimatch-suite`)
- `concurrency` - Parallel execution limit (default: `4`)
- `verbose` - Show detailed logs (default: `false`)

### Suite File Format

```json
{
  "name": "Component Suite",
  "defaults": {
    "dpr": 2,
    "size": "pad",
    "align": "top-left",
    "bootstrap": true
  },
  "items": [
    {
      "name": "Button Primary",
      "figma": "fileKey:nodeId",
      "story": "http://localhost:6006/?path=/story/button--primary",
      "selector": "#root button"
    }
  ]
}
```

### Output

Generates directory per item with:
- `figma.png`, `impl.png`, `diff.png` - Visual artifacts
- `report.json` - Detailed metrics
- `suite-report.json` - Overall summary (in outDir root)
