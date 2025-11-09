# CLI Usage

## Commands

- `compare` - Compare single Figma design with implementation
- `suite` - Run multiple comparisons from JSON suite file

## Compare Command

Compare Figma design with implementation using UIMatch Core.

### Basic Usage

```bash
bun run uimatch:compare -- \
  figma=<FILE:NODE> \
  story=<URL> \
  selector=<CSS_SELECTOR> \
  [options]
```

### Required Parameters

- `figma` - Figma reference in format `fileKey:nodeId` or full URL
- `story` - Target URL to compare (e.g., `http://localhost:3000`)
- `selector` - CSS selector for element to capture

### Options

#### Size Handling

- `size=<mode>` - Size handling: `strict|pad|crop|scale` (default: `strict`)
  - `pad` - Add letterboxing to smaller image (recommended for page vs component)
  - `crop` - Compare common region only
  - `scale` - Scale to match dimensions
- `align=<mode>` - Alignment for pad/crop: `center|top-left|top|left` (default: `center`)
- `contentBasis=<mode>` - Content area basis: `union|intersection|figma|impl` (default: `union`)
  - `intersection` - Focus on overlapping area (recommended with `pad`)
  - **Note**: When `size=pad` is used, the comparison engine automatically sets `contentBasis=intersection` if not explicitly specified

#### Style Comparison

- `ignore=<props>` - Comma-separated CSS properties to exclude
- `weights=<json>` - Category weights for DFS (e.g., `'{"color":0.5,"spacing":1}'`)
- `bootstrap=<bool>` - Auto-generate expectedSpec from Figma (default: `true`)

#### Selector Resolution

- `selectors=<path>` - Path to anchors JSON (internally: `anchorsPath`)
- `selectorsWriteBack=<bool>` - Write back to anchors JSON (default: `false`)
- `selectorsPlugin=<pkg>` - Plugin package (defaults to `@uimatch/selector-anchors` when `selectors` is specified)

**Pluggable Architecture:**

Selector resolution is **optional and pluggable** via SPI (Service Provider Interface):

- Default plugin (`@uimatch/selector-anchors`) uses AST analysis + liveness checking
- Plugin is loaded when either `selectors` path is provided OR `selectorsPlugin`/`UIMATCH_SELECTORS_PLUGIN` is explicitly specified (no overhead if unused)
- Graceful fallback with warning if plugin unavailable
- Custom plugins supported via `selectorsPlugin=<package-name>` or `UIMATCH_SELECTORS_PLUGIN` environment variable

**Workflow:**

1. Provide `selectors=anchors.json` with code location hints
2. Plugin resolves anchors to live CSS selectors (AST + snippet hash)
3. Liveness check prioritizes stable attributes (`data-testid` > `role` > `class`)
4. Returns best selector with stability score and reasoning
5. Optional: `selectorsWriteBack=true` updates anchors JSON

#### Output & Capture

- `outDir=<path>` - Save artifacts to directory
- `timestampOutDir=<bool>` - Add timestamp to outDir to avoid collisions (default: `true`, `false` when `CI=true`)
- `format=<type>` - Output format: `standard|claude` (default: `standard`)
- `viewport=<WxH>` - Viewport size (e.g., `1584x1104`)
- `dpr=<number>` - Device pixel ratio for browser capture (default: `2`)
- `figmaScale=<number>` - Figma image export scale, independent of browser DPR (default: `2`)
- `figmaAutoRoi=<bool>` - Auto-detect optimal child node when parent is too large (default: `false`)
- `fontPreload=<urls>` - Font URLs to preload for consistent rendering

### Environment Variables

**Figma Access** (priority: BYPASS > REST > MCP):

```bash
# REST (recommended): Figma Personal Access Token
FIGMA_ACCESS_TOKEN=figd_xxx

# MCP (fallback): Use figma=current with Figma Desktop + MCP server
```

Optional:

```bash
# Selector resolution plugin (alternative to selectorsPlugin= argument)
UIMATCH_SELECTORS_PLUGIN=@uimatch/selector-anchors

# Basic authentication for target URLs
BASIC_AUTH_USER=username
BASIC_AUTH_PASS=password

# Performance tuning (for development and E2E stability)
UIMATCH_BBOX_TIMEOUT_MS=30000        # Timeout for element bounding box detection (default: 30000ms)
UIMATCH_SCREENSHOT_TIMEOUT_MS=30000  # Timeout for screenshot capture (default: 30000ms)
```

### Example: Basic Comparison

```bash
bun run uimatch:compare -- \
  figma="eUyFpkxbluuyFVn0mAmJSB:13-1023" \
  story="http://localhost:3000" \
  selector="main > div > div:nth-child(2)" \
  outDir=.uimatch-out
```

### Example: Page vs Component (Recommended Settings)

```bash
bun run uimatch:compare -- \
  figma="FILEKEY:COMPONENT_NODE" \
  story="http://localhost:3000" \
  selector='[data-testid="component-root"]' \
  size=pad \
  align=top-left \
  contentBasis=intersection \
  ignore=background-color,gap \
  outDir=.uimatch-out
```

**Why these settings:**

- `size=pad` + `align=top-left` reduces asymmetric padding noise
- `contentBasis=intersection` focuses on overlapping content only
- `ignore` filters out parent wrapper styles

### Example: LLM-Assisted Patching

```bash
bun run uimatch:compare -- \
  figma="FILEKEY:NODEID" \
  story="http://localhost:3000" \
  selector='[data-testid="component"]' \
  size=pad \
  format=claude \
  outDir=.uimatch-out
```

Generates:

- `claude.json` - Structured diff data for LLM consumption
- `claude-prompt.txt` - Ready-to-use prompt with instructions

### Output Artifacts

When `outDir` is specified, generates:

- `figma.png` - Figma design screenshot
- `impl.png` - Implementation screenshot
- `diff.png` - Visual diff with red highlights
- `report.json` - Detailed metrics
- `claude.json` - LLM-formatted diffs (if `format=claude`)
- `claude-prompt.txt` - Pre-formatted prompt (if `format=claude`)

### Metrics

- **pixelDiffRatio** - Global pixel difference (0-1)
- **pixelDiffRatioContent** - Content-only pixel difference (more accurate)
- **contentCoverage** - Percentage of canvas that is content
- **colorDeltaEAvg** - Average color difference (CIEDE2000)
- **DFS (Design Fidelity Score)** - Weighted style matching score (0-100)
- **styleFidelityScore (SFS)** - Normalized style score with category breakdown

### Selector Resolution Report

When `selectorsPlugin` is enabled and a plugin successfully resolves the selector, `report.json` includes a `selectorResolution` section:

```json
{
  "selectorResolution": {
    "chosen": "[data-testid=\"submit-button\"]",
    "stability": 85,
    "reasons": [
      "Found via AST anchors with snippet hash match",
      "Liveness check passed in 120ms",
      "Prioritized testid attribute (highest stability)"
    ],
    "plugin": "@uimatch/selector-anchors"
  }
}
```

**Fields:**

- `chosen` - Resolved CSS selector used for capture
- `stability` - Stability score (0-100) based on selector type and heuristics, consistent with DFS/SFS/CQI metrics
- `reasons` - Array of explanation strings for debugging and transparency
- `plugin` - Plugin package that performed resolution

**Stability Scoring:**

The stability score (0-100) is a **weighted composite** of four factors:

1. **Hint Quality (40%)**: Quality of the selector hint
   - `data-testid`: 1.0
   - `role`: 0.8
   - `text`: 0.5
   - `css`: 0.3

2. **Snippet Match (20%)**: Whether code snippet matches AST
   - Matched: 1.0
   - Not matched: 0.0

3. **Liveness (30%)**: Selector validity check
   - Alive: 1.0
   - Unchecked: 0.5
   - Dead: 0.0

4. **Specificity (10%)**: Attribute specificity
   - `data-testid`: 1.0
   - `role[name]`: 0.9
   - `role`: 0.7
   - Semantic classes: 0.6
   - Generic selectors: 0.3

**Score formula**: `(hintQuality * 0.4 + snippetMatch * 0.2 + liveness * 0.3 + specificity * 0.1) * 100`

**Examples:**
- Perfect `data-testid` (matched + alive): 100
- `role[name]` without snippet match: ~78
- Generic CSS selector (dead): ~15

The documented scores represent **potential maximums** when all factors are optimal.

This information is useful for:

- **LLM context**: Understanding how the element was located
- **Debugging**: Troubleshooting selector resolution failures
- **Maintenance**: Identifying fragile selectors that may need improvement

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

## Tips

### Quality Gate Configuration

Configure acceptance thresholds via settings:

```bash
# Development (relaxed)
bun run uimatch:settings -- set \
  comparison.acceptancePixelDiffRatio=0.15 \
  comparison.acceptanceColorDeltaE=10

# Production (strict)
bun run uimatch:settings -- set \
  comparison.acceptancePixelDiffRatio=0.05 \
  comparison.acceptanceColorDeltaE=3
```

### Common Ignore Patterns

- Layout wrappers: `background-color,gap,padding,margin`
- Container styles: `border-width,box-shadow,outline`
- Reset styles: `display,position,z-index`

### ROI (Region of Interest) Matching

Always compare equivalent regions:

- **Figma**: Use component frame's node ID (not entire page)
- **Implementation**: Use component root selector (not page container)

```bash
# Good: Component-to-component
figma="FILEKEY:ACCORDION_COMPONENT_NODE"
selector='[data-testid="accordion-root"]'

# Bad: Page-to-component (creates noise)
figma="FILEKEY:PAGE_NODE"
selector='[data-testid="accordion-root"]'
```

**Auto-ROI Feature**: When `figmaAutoRoi=true`, automatically detects the best matching child node if the specified Figma node is significantly larger than the implementation capture. Useful when only page-level node IDs are available.

```bash
# Auto-detect optimal child node
figma="FILEKEY:PAGE_NODE"
selector='[data-testid="accordion-root"]'
figmaAutoRoi=true
size=pad
contentBasis=intersection
```
