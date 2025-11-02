---
name: 'uiMatch Compare'
description: 'Compare Figma design with implementation and return DiffReport'
version: '0.1.0'
dependencies: 'Node.js >=22.11.0, Playwright, Figma MCP server'
---

# uiMatch Compare Command

This command compares a Figma design frame with a live implementation and returns a detailed comparison report.

## Trigger Conditions

Use this command when:

- User requests to compare a Figma design with an implementation
- User provides both a Figma reference (URL or fileKey:nodeId) and a target URL
- User asks to check design fidelity or visual differences
- User wants to validate UI implementation against Figma designs

## Prerequisites

- **Figma access** via REST API (recommended) or MCP server:
  - REST API: Set `FIGMA_ACCESS_TOKEN` environment variable
  - MCP (fallback): Set `FIGMA_MCP_URL` for Figma MCP server
- **Target URL** accessible (may require `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` for protected environments)
- **Figma reference** in one of these formats:
  - `fileKey:nodeId` (e.g., `abc123:1-2`)
  - Full Figma URL with node-id parameter
- **CSS selector** to identify the target element in the implementation

## Execution Steps

When the user requests a comparison, follow these steps:

1. **Parse input parameters** from the user's message:
   - `figma`: Figma reference (URL or fileKey:nodeId)
   - `story`: Target implementation URL
   - `selector`: CSS selector for the element to compare
   - Optional: `viewport`, `dpr`, `thresholds`, `emitArtifacts`, `fontPreload`, `expectedSpec`, `tokens`

2. **Import and execute the comparison function**:

   ```typescript
   import { uiMatchCompare } from 'uimatch-plugin';

   const result = await uiMatchCompare({
     figma: '<fileKey>:<nodeId>',
     story: '<target-url>',
     selector: '<css-selector>',
     viewport: { width: 1440, height: 900 }, // optional
     dpr: 1, // optional, default 1
     thresholds: { deltaE: 3.0 }, // optional
     emitArtifacts: false, // optional, set true to get base64 images
     fontPreload: [], // optional, font URLs to preload
     expectedSpec: {}, // optional, expected CSS properties
     tokens: {}, // optional, design token mappings
   });
   ```

3. **Parse the result**:
   - `result.summary`: Short summary with DFS and key metrics
   - `result.report.metrics`: Pixel diff ratio, color delta E, DFS score
   - `result.report.styleDiffs`: Array of style differences with patch hints
   - `result.report.artifacts`: Base64 images (if `emitArtifacts: true`)

4. **Present the results** to the user:
   - Show the summary first
   - If there are style diffs, show top 5 high/medium severity issues
   - Provide patch hints with suggested fixes
   - If DFS < 90, suggest running `/uiMatch loop` for iterative fixes

## Usage Examples

### Example 1: Basic Comparison (CLI)

**User input**:
"Compare this Figma design https://www.figma.com/file/abc123?node-id=1-2 with http://localhost:6006/?path=/story/button and check the button with selector '#root button'"

**Recommended approach** (using official CLI):

```bash
uimatch compare \
  figma=abc123:1-2 \
  story=http://localhost:6006/iframe.html?id=button \
  selector="#storybook-root" \
  size=pad \
  outDir=./.uimatch-out/button-check
```

**Programmatic approach** (if needed):

```typescript
const result = await uiMatchCompare({
  figma: 'abc123:1-2',
  story: 'http://localhost:6006/?path=/story/button',
  selector: '#root button',
  sizeMode: 'pad', // handle size differences gracefully
});

// Output summary
console.log(result.summary);
// "DFS: 87 | pixelDiffRatio: 2.34% | colorDeltaEAvg: 1.20"
```

**Response to user**:

```
Design Fidelity Score: 87/100

Pixel difference: 2.34%
Color difference: 1.20 ΔE (low)
Style differences: 3 issues found (1 high severity)

Top issues:
1. [high] color: expected var(--color-primary), got #1a73e8 (ΔE: 6.5)
   → Suggested fix: Use `var(--color-primary)` instead of #1a73e8

2. [medium] font-size: expected 16px, got 14px (delta: -2px)
   → Suggested fix: Change font-size to 16px

3. [low] padding-left: expected 16px, got 12px (delta: -4px)
```

### Example 2: With Artifact Saving (CLI)

**User input**:
"Compare the card component and save the diff images"

**CLI execution** (recommended):

```bash
uimatch compare \
  figma=xyz789:5-10 \
  story=http://localhost:3000/card \
  selector="[data-testid='card']" \
  size=pad \
  outDir=./.uimatch-out/card-comparison \
  overlay=true
```

This will save:

- `figma.png` - Design from Figma
- `impl.png` - Implementation screenshot
- `diff.png` - Diff visualization (red = differences)
- `overlay.png` - Implementation with red highlights (if overlay=true)
- `report.json` - Detailed comparison report

**Programmatic approach** (if needed):

```typescript
const result = await uiMatchCompare({
  figma: 'xyz789:5-10',
  story: 'http://localhost:3000/card',
  selector: '[data-testid="card"]',
  emitArtifacts: true,
});

// Then save manually if needed (see examples/save-artifacts-example.ts)
```

### Example 3: With Design Tokens

**User input**:
"Compare the design using our design tokens from the token map"

**Execution**:

```typescript
const result = await uiMatchCompare({
  figma: 'fileKey:nodeId',
  story: 'https://app.example.com/component',
  selector: '.component',
  tokens: {
    color: {
      '--color-primary': '#1a73e8',
      '--color-text': '#202124',
    },
    spacing: {
      '--spacing-md': '16px',
    },
  },
});
```

## Error Handling

### Figma Connection Error

**Error**: `Figma API error` or `Figma MCP error: 500`

**Solution**:

1. **REST API** (recommended): Verify `FIGMA_ACCESS_TOKEN` is set correctly
2. **MCP** (fallback): Check that `FIGMA_MCP_URL` is set and server is running
3. Test MCP connection: `curl $FIGMA_MCP_URL/health`

### Target URL Not Accessible

**Error**: `Target timeout` or `Navigation failed`

**Solution**:

1. Verify the target URL is accessible
2. Check if basic auth credentials are needed
3. Increase timeout or wait for network idle

### Selector Not Found

**Error**: `captureTarget: boundingBox not available for selector=...`

**Solution**:

1. Verify the selector matches an element on the page
2. Try using a `data-testid` attribute for more reliable selection
3. Check if the element is inside an iframe (Storybook auto-detection should handle this)

### Image Dimension Mismatch

**Error**: `Image dimensions do not match: Figma (...) vs Implementation (...)`

**Solution**:

1. Ensure `dpr` matches the Figma export scale
2. Check viewport settings
3. Verify the element is fully visible and not clipped

## Output Format

The command returns a structured result:

```typescript
{
  summary: string; // "DFS: 95 | pixelDiffRatio: 1.2% | ..."
  report: {
    metrics: {
      pixelDiffRatio: number; // 0-1
      colorDeltaEAvg: number; // CIEDE2000 average
      dfs: number; // 0-100 Design Fidelity Score
    };
    styleDiffs: Array<{
      path: string;
      selector: string;
      properties: Record<string, {
        actual?: string;
        expected?: string;
        expectedToken?: string;
        delta?: number;
        unit?: string;
      }>;
      severity: 'low' | 'medium' | 'high';
      patchHints?: Array<{
        property: string;
        suggestedValue: string;
        severity: 'low' | 'medium' | 'high';
      }>;
    }>;
    artifacts?: {
      figmaPngB64?: string;
      implPngB64?: string;
      diffPngB64?: string;
    };
  };
}
```

## CLI Options Reference

**Required**:

- `figma=<value>` - Figma file key and node ID (e.g., AbCdEf:1-23) or URL
- `story=<url>` - Target URL to compare
- `selector=<css>` - CSS selector for element to capture

**Optional**:

- `viewport=<WxH>` - Viewport size (e.g., 1584x1104)
- `dpr=<number>` - Device pixel ratio (default: 2)
- `detectStorybookIframe=<bool>` - Auto-detect Storybook iframe (default: auto-detects only when URL contains /iframe.html)
- `size=<mode>` - Size handling (strict|pad|crop|scale, default: strict)
- `align=<mode>` - Alignment for pad/crop (center|top-left|top|left)
- `padColor=<color>` - Padding color (auto|#RRGGBB, default: auto)
- `outDir=<path>` - Save artifacts to directory (creates .uimatch-out by default)
- `overlay=<bool>` - Save overlay.png with highlights (default: false)
- `jsonOnly=<bool>` - Omit base64 from JSON (default: true if outDir set)
- `verbose=<bool>` - Show full URLs and paths (default: false, sanitized for safety)

## Integration Notes

- **CLI available**: `uimatch compare` (see above for options)
- **Programmatic API**: `import { uiMatchCompare } from 'uimatch-plugin'`
- **Artifacts**: Saved to `.uimatch-out/` by default (gitignored)
- **Logging**: Sanitized by default (no tokens, relative paths, compact Figma refs)
- **Figma access**: REST API (recommended) with `FIGMA_ACCESS_TOKEN`, or MCP server fallback
- Playwright used for browser automation (Chromium headless)
- Color differences use CIEDE2000 perceptual color distance

## See Also

- `/uiMatch loop` - Iterative comparison with quality gates
- `/uiMatch settings` - Configure thresholds and defaults
