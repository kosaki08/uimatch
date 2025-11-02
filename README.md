# uiMatch

Design-to-implementation comparison tool that evaluates how closely an implemented UI matches a Figma design. Distributed as a Claude Code plugin.

## Features

- **Pixel-perfect comparison**: Visual diff with pixelmatch
- **Style analysis**: CSS property comparison with color ΔE2000
- **Design tokens**: Token mapping for consistent design system
- **Figma integration**: Direct Figma MCP integration for frame capture
- **Quality scoring**: Design Fidelity Score (DFS 0-100)
- **Quality Gate**: CQI score (0-100), suspicion detection, and smart re-evaluation recommendations
- **Selector Resolution**: Extensible plugin architecture for stable selector resolution
- **Browser reuse**: Automatic browser pooling for faster iteration
- **Iterative workflow**: Quality gates with automatic retry

## Installation

```bash
# Add marketplace
/plugin marketplace add <org>/uimatch

# Install plugin
/plugin install uimatch
```

## Usage

### Claude Code Plugin

```bash
# Compare Figma design with implementation
/uiMatch compare figma=<fileKey>:<nodeId> story=<url> selector=<css>

# With selector resolution plugin
/uiMatch compare figma=... story=... selector=... selectors=./anchors.json

# Iterative comparison loop
/uiMatch loop figma=... story=... selector=... maxIters=5

# Configure settings
/uiMatch settings
```

### CLI (Direct)

```bash
# Build the project first
bun run build

# Compare command
bun run uimatch:compare -- figma=AbCdEf:1-23 story=http://localhost:6006/?path=/story/button selector="#root button"

# Loop command (with browser reuse)
bun run uimatch:loop -- figma=AbCdEf:1-23 story=http://localhost:6006/?path=/story/button selector="#root button" maxIters=5

# Settings management
bun run uimatch:settings -- get
bun run uimatch:settings -- set comparison.acceptancePixelDiffRatio=0.03
bun run uimatch:settings -- reset
```

## Project Structure

```
ui-match/
├── .claude-plugin/             # Plugin definition
│   ├── plugin.json
│   ├── commands/               # /uiMatch commands
│   └── mcp.json                # Figma MCP integration
├── packages/
│   ├── uimatch-selector-spi/   # SPI type definitions (build first)
│   ├── uimatch-core/           # Core comparison library
│   ├── uimatch-plugin/         # Plugin integration
│   └── uimatch-selector-anchors/ # Optional selector resolution plugin
└── docs/specs/                 # Specifications
```

## Development

```bash
# Install dependencies
bun install

# Build packages (in dependency order)
# 1. Build SPI package first (type definitions)
cd packages/uimatch-selector-spi && bun run build

# 2. Build selector-anchors (optional plugin)
cd packages/uimatch-selector-anchors && bun run build

# Run tests
bun test

# Lint and format
bun run lint
bun run format
```

**Important**: When using selector resolution in production, ensure `@uimatch/selector-anchors` is built before testing. The plugin is loaded dynamically at runtime and requires the built `dist/` directory.

## Documentation

- [v0.1 Specification](docs/specs/v0.1.md) - MVP implementation spec
- [AGENTS.md](AGENTS.md) - AI assistant guidelines

## Testing

- Unit tests: `bun test` runs tests under `packages/*/src/**/*.test.ts` only (excludes `dist/`).
- Browser integration tests (Playwright) are disabled by default to avoid failures in restricted environments.

Enable integration tests:

```bash
export UIMATCH_ENABLE_BROWSER_TESTS=true
bunx playwright install chromium
# Optional stability flags
export UIMATCH_CHROME_CHANNEL=chrome
export UIMATCH_CHROME_ARGS="--no-sandbox --disable-gpu --single-process --no-zygote"
export UIMATCH_HEADLESS=true

bun test
```

## Selector Resolution Plugin

UIMatch supports pluggable selector resolution for stable element location:

```bash
# Optional: Install selector resolution plugin
bun add -D @uimatch/selector-anchors

# Use with anchors JSON
/uiMatch compare figma=... story=... selector=... selectors=./anchors.json

# Enable writeback to update anchors
/uiMatch compare ... selectors=./anchors.json selectorsWriteBack=true

# Use custom plugin
/uiMatch compare ... selectorsPlugin=my-custom-resolver
```

**Environment variable (alternative to CLI flag):**

```bash
export UIMATCH_SELECTORS_PLUGIN=@uimatch/selector-anchors
```

For details, see [CLI Usage](docs/cli-usage.md#selector-resolution).

## Requirements

**Development**: Bun (required for monorepo workspace and scripts)
**Distribution**: Node.js >=22.11.0 (CLI built with tsup runs on Node.js)

- Playwright (auto-installed via postinstall)

## Configuration

### Figma CSS Mapping

Figma design properties are mapped to CSS as follows:

- **TEXT nodes**: `fill` → `color` (text color)
- **Other nodes**: `fill` → `background-color`, `stroke` → `border-color`

This ensures accurate color comparison for text elements vs. containers.

### Environment Variables

- `UIMATCH_HEADLESS` - Control browser headless mode (default: `true`, set to `false` to show browser)
- `UIMATCH_CHROME_CHANNEL` - Browser channel to use (`chrome`, `msedge`, etc.)
- `UIMATCH_CHROME_ARGS` - Additional Chrome arguments (space-separated)
- `BASIC_AUTH_USER` - Basic auth username for target URLs
- `BASIC_AUTH_PASS` - Basic auth password for target URLs

### Settings File

Create `.uimatchrc.json` in your project root:

```json
{
  "comparison": {
    "pixelmatchThreshold": 0.1,
    "acceptancePixelDiffRatio": 0.03,
    "acceptanceColorDeltaE": 3.0,
    "includeAA": false
  },
  "capture": {
    "defaultIdleWaitMs": 150
  }
}
```

#### Recommended Thresholds for Pad+Intersection Mode

When using `size=pad` with `contentBasis=intersection` (default), the default thresholds may be too strict during development. Consider these relaxed presets:

**Development preset** (for active iteration):

```bash
bun run uimatch:settings -- set \
  comparison.acceptancePixelDiffRatio=0.08 \
  comparison.acceptanceColorDeltaE=5
```

**Production preset** (for final validation):

```bash
bun run uimatch:settings -- set \
  comparison.acceptancePixelDiffRatio=0.01 \
  comparison.acceptanceColorDeltaE=3
```

The pad+intersection mode calculates `pixelDiffRatioContent` based on the intersection of content areas, which provides a more intuitive metric for visual perception. A typical layout mismatch (e.g., flex-direction or padding differences) may result in 3-8% content-based pixel differences, which should be acceptable during iterative development.

## Browser Reuse

The `/uiMatch loop` command automatically reuses browser instances for improved performance:

- Browser is launched once and shared across iterations
- Each comparison uses a lightweight browser context
- Automatic cleanup when loop completes
- Reduces iteration time from ~2s to ~500ms per comparison
