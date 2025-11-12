# @uimatch/cli

Claude Code plugin and CLI for comparing Figma designs with implementation. Provides commands for visual comparison, iterative improvement loops, and settings management.

## Features

- **Figma Integration**: Direct integration with Figma API and MCP server
- **Quality Scoring**: Design Fidelity Score (DFS) with configurable thresholds
- **Iterative Loops**: Automatic retry with quality gates
- **LLM-Friendly Output**: Formatted results for AI assistant consumption
- **CLI Tools**: Standalone command-line interface
- **Settings Management**: Persistent configuration with validation

## Installation

### As Claude Code Plugin

```bash
# Add marketplace (if not already added)
/plugin marketplace add <org>/uimatch

# Install plugin
/plugin install uimatch
```

### As Standalone CLI

```bash
# Global installation (recommended)
npm install -g @uimatch/cli playwright
npx playwright install chromium

# Or project-local installation
npm install -D @uimatch/cli playwright
npx playwright install chromium
```

## Usage

### Claude Code Commands

The plugin provides three commands:

#### /uiMatch compare

Compare a Figma design with implementation:

```bash
/uiMatch compare figma=<fileKey>:<nodeId> story=<url> selector=<css>
```

**Examples**:

```bash
# Basic comparison
/uiMatch compare figma=AbCdEf123:456-789 story=http://localhost:6006/?path=/story/button selector="#root button"

# With custom thresholds (using thresholds object)
/uiMatch compare figma=AbCdEf123:456-789 story=http://localhost:6006 selector=".card" thresholds.pixelDiffRatio=0.05 thresholds.deltaE=5.0

# With quality profile
/uiMatch compare figma=AbCdEf123:456-789 story=http://localhost:6006 selector=".card" profile=development

# With output directory
/uiMatch compare figma=... story=... selector=... outDir=./comparison-results
```

**Parameters**:

- `figma`: Figma file key and node ID (format: `fileKey:nodeId`)
- `story`: Implementation URL (Storybook, localhost, or deployed)
- `selector`: CSS selector for target element
- `profile`: (Optional) Quality profile (`component/strict` | `component/dev` | `page-vs-component` | `lenient` | `custom`, default from settings)
- `thresholds.pixelDiffRatio`: (Optional) Pixel difference ratio (0-1, overrides profile)
- `thresholds.deltaE`: (Optional) Color ΔE threshold (0-50, overrides profile)
- `outDir`: (Optional) Output directory for artifacts (screenshots, diffs)
- `textCheck`: (Optional) Text content validation (see Text Matching section below)

**Output**:

- Design Fidelity Score (DFS 0-100)
- Pass/fail status based on quality gates
- Pixel and style difference details
- Visual diff image (if outDir specified)
- LLM-formatted suggestions for improvements

#### /uiMatch loop

Iterative comparison with automatic retries:

```bash
/uiMatch loop figma=<fileKey>:<nodeId> story=<url> selector=<css> maxIters=5
```

**Examples**:

```bash
# Basic loop with 5 iterations
/uiMatch loop figma=AbCdEf123:456-789 story=http://localhost:6006 selector="#button" maxIters=5

# Custom quality profile
/uiMatch loop figma=... story=... selector=... profile=development maxIters=10

# With output directory
/uiMatch loop figma=... story=... selector=... outDir=./iterations maxIters=3
```

**Parameters**:

- Same as `compare` command
- `maxIters`: Maximum number of iterations (default: 5)
- `profile`: Quality gate profile (`component/strict` | `component/dev` | `page-vs-component` | `lenient` | `custom`, default: `component/strict`)

**Behavior**:

1. Performs initial comparison
2. If quality gates fail, provides improvement suggestions
3. Waits for user to make changes
4. Repeats comparison up to `maxIters` times
5. Stops when quality gates pass or max iterations reached

**Features**:

- Browser instance reuse for faster iterations (~500ms vs ~2s)
- Automatic quality gate evaluation
- Iteration-specific output directory structure
- Cumulative improvement tracking

#### /uiMatch settings

Manage plugin configuration:

```bash
# View current settings
/uiMatch settings

# Get specific setting
/uiMatch settings get comparison.acceptancePixelDiffRatio

# Set a setting
/uiMatch settings set comparison.acceptancePixelDiffRatio=0.05

# Reset to defaults
/uiMatch settings reset
```

**Available Settings**:

```typescript
{
  comparison: {
    pixelmatchThreshold: number; // 0-1, default: 0.1
    acceptancePixelDiffRatio: number; // 0-1, default: 0.01
    acceptanceColorDeltaE: number; // 0-50, default: 3.0
    includeAA: boolean; // default: false
  },
  capture: {
    defaultIdleWaitMs: number; // milliseconds, default: 150
  }
}
```

### Standalone CLI

The plugin also provides a standalone CLI for use outside of Claude Code:

```bash
# Compare command
uimatch compare figma=<fileKey>:<nodeId> story=<url> selector=<css>

# Suite command (batch comparison)
uimatch suite suite-config.json

# Doctor command (diagnostics)
uimatch doctor
```

**Note:** The `loop` command is available only as a Claude Code plugin command (`/uiMatch loop`), not in standalone CLI.

For detailed CLI usage, available options, and advanced features (size handling, content basis modes, auto-ROI, suite testing, etc.), see [**CLI Usage Documentation**](../../docs/cli-usage.md).

### Programmatic API

```typescript
import { uiMatchCompare, uiMatchLoop, getSettings, updateSettings } from '@uimatch/cli';

// Run comparison
const result = await uiMatchCompare({
  figma: 'AbCdEf123:456-789',
  story: 'http://localhost:6006',
  selector: '#button',
  pixelThreshold: 0.01,
  colorThreshold: 3.0,
});

console.log(`DFS: ${result.dfs}`);
console.log(`Status: ${result.status}`);

// Run iterative loop
await uiMatchLoop({
  figma: 'AbCdEf123:456-789',
  story: 'http://localhost:6006',
  selector: '#button',
  maxIters: 5,
  profile: 'development',
});

// Settings management
const settings = await getSettings();
await updateSettings({ comparison: { acceptancePixelDiffRatio: 0.05 } });
```

## Configuration

### Quality Gate Profiles

| Profile             | pixelDiffRatio | ΔE  | areaGapCritical | contentBasis | Use Case                |
| ------------------- | -------------- | --- | --------------- | ------------ | ----------------------- |
| `component/strict`  | 0.01           | 3.0 | 0.15            | union        | DS component validation |
| `component/dev`     | 0.08           | 5.0 | 0.20            | union        | Dev iteration           |
| `page-vs-component` | 0.12           | 5.0 | 0.25            | intersection | Padded page comparison  |
| `lenient`           | 0.15           | 8.0 | 0.30            | union        | PoC/prototype           |
| `custom`            | (config)       |     |                 |              | From settings file      |

**Note**: When using `size=pad`, the comparison engine automatically sets `contentBasis=intersection` if not explicitly specified.

**Threshold Layers:**

- **Quality Gate (Acceptance)**: Pass/fail thresholds for overall comparison (shown in profiles above)
  - `acceptancePixelDiffRatio` / `acceptanceColorDeltaE` in settings
  - Default: 3.0 for color ΔE (strict validation)
- **Style Diff (Detection)**: Per-property change detection thresholds (internal to diff engine)
  - `defaultThresholds.deltaE` in core comparison
  - Default: 5.0 for color ΔE (broader detection)

These are separate layers: detection threshold captures all notable differences, while acceptance threshold determines pass/fail status.

### Environment Variables

Required for Figma integration:

- `FIGMA_MCP_URL`: Figma MCP server URL (default: `http://127.0.0.1:3845/mcp`)
- `FIGMA_MCP_TOKEN`: (Optional) Bearer token for Figma MCP authentication

Optional for target URL authentication:

- `BASIC_AUTH_USER`: Basic auth username
- `BASIC_AUTH_PASS`: Basic auth password

Optional for browser configuration:

- `UIMATCH_HEADLESS`: Control browser headless mode (default: `true`)
- `UIMATCH_CHROME_CHANNEL`: Browser channel (`chrome`, `msedge`, etc.)
- `UIMATCH_CHROME_ARGS`: Additional Chrome arguments (space-separated)

### Settings File

Create `.uimatchrc.json` in your project root:

```json
{
  "comparison": {
    "pixelmatchThreshold": 0.1,
    "acceptancePixelDiffRatio": 0.01,
    "acceptanceColorDeltaE": 3.0,
    "includeAA": false
  },
  "capture": {
    "defaultIdleWaitMs": 150
  }
}
```

## Design Fidelity Score (DFS)

0-100 score calculated via deduction model: `100 - (pixel penalty + color penalty + size penalty + style penalty)`. Penalties based on pixel diff ratio, color ΔE, dimension mismatch, and high-severity style diffs.

## Output Format

### Console Output

```
=== uiMatch Comparison Results ===

Design Fidelity Score (DFS): 87.5/100
Status: ⚠️  FAIL (Below acceptance threshold)

Pixel Comparison:
  - Difference: 4.2% (threshold: 3.0%)
  - Total pixels: 48,000
  - Differing pixels: 2,016
  - Content coverage: 78.5%

Style Analysis:
  - Average color ΔE: 4.5 (threshold: 3.0)
  - Critical differences: 2

Style Differences:
  #root button.primary:
    - background-color: #007bff (actual) vs #0066cc (expected) [ΔE: 5.2]
    - padding: 10px (actual) vs 12px (expected) [Δ: 2px]

Suggested Improvements:
  1. Adjust background-color from #007bff to #0066cc
  2. Increase padding from 10px to 12px
```

### LLM-Formatted Output

When used within Claude Code, the output is formatted for AI assistant consumption:

```markdown
## Comparison Result

**Status**: ⚠️ FAIL (DFS: 87.5/100)

### Pixel Analysis

- Difference: 4.2% (content-based)
- Threshold: 3.0%
- Assessment: Exceeds acceptable threshold by 1.2%

### Style Analysis

- Average color ΔE: 4.5
- Threshold: 3.0
- Critical differences: 2 properties

### Actionable Improvements

1. **Color Correction**
   - Element: `#root button.primary`
   - Property: `background-color`
   - Current: `#007bff`
   - Expected: `#0066cc`
   - ΔE: 5.2 (perceptually different)

2. **Spacing Adjustment**
   - Element: `#root button.primary`
   - Property: `padding`
   - Current: `10px`
   - Expected: `12px`
   - Delta: 2px

### Next Steps

- Update button background color to match design
- Increase padding to align with spacing system
- Re-run comparison to verify improvements
```

## Text Matching

The `textCheck` option validates text content between Figma and implementation.

**Workflow**: Layout/background → TEXT color (fill→`color`) → textCheck

```typescript
textCheck: {
  enabled: true,
  mode: 'self',         // 'self' | 'descendants'
  normalize: 'nfkc_ws', // 'none' | 'nfkc' | 'nfkc_ws'
  match: 'ratio',       // 'exact' | 'contains' | 'ratio'
  minRatio: 0.98
}
```

## Figma Integration

**Access Priority**: BYPASS (test mode) > REST API (`FIGMA_ACCESS_TOKEN`) > MCP Server

### Option 1: MCP Server (Recommended)

Configure MCP via `.claude-plugin/mcp.json`:

```json
{
  "figma": {
    "url": "http://127.0.0.1:3845/mcp",
    "token": "${FIGMA_MCP_TOKEN}"
  }
}
```

**Example with `figma=current` (requires Figma MCP)**:

```bash
# Use currently selected node in Figma desktop app
/uiMatch compare \
  figma=current \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button"

# Works with MCP server running - no need to manually copy file keys or node IDs
# The Figma MCP server automatically fetches the selected node context
```

This is the smoothest workflow: open your design in Figma desktop, select the frame, and run the command. The MCP server handles node ID extraction automatically.

### Option 2: REST API (Alternative)

REST API mode requires `FIGMA_ACCESS_TOKEN` environment variable and supports all features without MCP infrastructure:

```bash
export FIGMA_ACCESS_TOKEN=your-personal-access-token

/uiMatch compare \
  figma=AbCdEf123:1-23 \
  story=http://localhost:6006 \
  selector="#root button"
```

**Note**: REST API mode requires explicit `fileKey:nodeId` format. Use MCP for `figma=current` support.

## Examples

### Basic Component Comparison

```bash
# Compare a button component
/uiMatch compare \
  figma=AbCdEf123:1-23 \
  story=http://localhost:6006/?path=/story/button--primary \
  selector="#root button"
```

### Iterative Development Loop

```bash
# Start iterative improvement loop
/uiMatch loop \
  figma=AbCdEf123:1-23 \
  story=http://localhost:6006/?path=/story/card \
  selector=".card" \
  maxIters=10 \
  profile=development \
  outDir=./iterations

# Output directory structure:
# ./iterations/
#   iter-1/
#     figma.png
#     impl.png
#     diff.png
#     result.json
#   iter-2/
#     ...
```

### Custom Thresholds

```bash
# Relaxed thresholds for exploration
/uiMatch compare \
  figma=... story=... selector=... \
  pixelThreshold=0.08 \
  colorThreshold=8.0

# Strict thresholds for production
/uiMatch compare \
  figma=... story=... selector=... \
  pixelThreshold=0.01 \
  colorThreshold=2.0
```

### Batch Comparison (CLI)

```bash
# Create a comparison script
#!/usr/bin/env bash

components=(
  "button:1-23:#root .button"
  "card:2-34:.card"
  "modal:3-45:.modal"
)

for component in "${components[@]}"; do
  IFS=':' read -r name nodeId selector <<< "$component"
  uimatch compare \
    figma=AbCdEf123:${nodeId} \
    story=http://localhost:6006 \
    selector="${selector}" \
    outDir="./results/${name}"
done
```

## Troubleshooting

### Common Issues

**Browser Launch Failures**:

```bash
# Install Playwright browsers
bunx playwright install chromium

# Or use specific channel
export UIMATCH_CHROME_CHANNEL=chrome
```

**Figma Access Errors**:

```bash
# Verify MCP server is running (default URL)
curl http://127.0.0.1:3845/mcp/health

# Check environment variables
echo $FIGMA_MCP_URL
echo $FIGMA_MCP_TOKEN
```

**High Pixel Differences**:

- Check if dimensions match (use `sizeMode=pad` for development)
- Verify selector targets correct element
- Increase `idleWaitMs` if animations/loading are in progress
- Use `profile=development` for more relaxed thresholds

**Style Differences Not Detected**:

- Ensure expected spec is provided
- Verify CSS properties are captured (check `computedStyles` in output)
- Check if style changes are in pseudo-elements (not currently supported)

### Debug Mode

```bash
# Enable verbose logging
DEBUG=uimatch:* uimatch compare figma=... story=... selector=...

# Disable headless mode to see browser
export UIMATCH_HEADLESS=false
uimatch compare figma=... story=... selector=...
```

## Testing

```bash
# Run all tests
bun test

# Run specific test
bun test commands/compare.test.ts

# Watch mode
bun test --watch
```

## Path Aliases

Internal imports use `#plugin/*`:

- **Build**: esbuild alias (`tsup.config.ts`)
- **Runtime**: `package.json` imports field

## Type Definitions

```typescript
import type {
  CompareOptions,
  CompareResult,
  LoopOptions,
  LoopResult,
  Settings,
  QualityGateProfile,
} from '@uimatch/cli';
```

## License

See root project LICENSE.

## Related

- [@uimatch/core](../@uimatch/core) - Core comparison library
- [Claude Code](https://claude.com/claude-code) - AI-powered IDE integration
- [Figma](https://figma.com) - Design tool
- [Playwright](https://playwright.dev) - Browser automation
