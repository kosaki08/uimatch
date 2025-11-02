# uiMatch

Design-to-implementation comparison tool that evaluates how closely an implemented UI matches a Figma design. Distributed as a Claude Code plugin.

## Features

- **Pixel-perfect comparison**: Visual diff with pixelmatch
- **Style analysis**: CSS property comparison with color ΔE2000
- **Design tokens**: Token mapping for consistent design system
- **Figma integration**: Direct Figma MCP integration for frame capture
- **Quality scoring**: Design Fidelity Score (DFS 0-100)
- **Selector Resolution**: Extensible plugin architecture for stable selector resolution
- **Browser reuse**: Automatic browser pooling for faster iteration

## Installation

```bash
# Add marketplace
/plugin marketplace add <org>/uimatch

# Install plugin
/plugin install uimatch

# Install Playwright browsers (required peer dependency)
bunx playwright install chromium
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

# Settings management
bun run uimatch:settings -- get
bun run uimatch:settings -- set comparison.acceptancePixelDiffRatio=0.03
bun run uimatch:settings -- reset
```

## Configuration

Create `.uimatchrc.json` in your project root:

```json
{
  "comparison": {
    "pixelmatchThreshold": 0.1,
    "acceptancePixelDiffRatio": 0.03,
    "acceptanceColorDeltaE": 3.0
  }
}
```

**Environment variables:**

- `UIMATCH_HEADLESS` - Control browser headless mode (default: `true`)
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` - Basic auth credentials for target URLs

## Development

```bash
# Install dependencies
bun install

# Build packages
cd packages/uimatch-selector-spi && bun run build
cd ../uimatch-selector-anchors && bun run build

# Run tests
bun test

# Lint and format
bun run lint
bun run format
```

**Requirements:**

- Development: Bun (required for monorepo workspace)
- Distribution: Node.js >=22.11.0

## Documentation

- [CLI Usage](docs/cli-usage.md) - Detailed command-line usage and options
- [Advanced Configuration](docs/advanced-config.md) - Design notes, internal algorithms, tuning parameters
- [v0.1 Specification](docs/specs/v0.1.md) - MVP implementation spec
- [AGENTS.md](AGENTS.md) - AI assistant guidelines

## Project Structure

```
ui-match/
├── .claude-plugin/             # Plugin definition
├── packages/
│   ├── uimatch-core/           # Core comparison library
│   ├── uimatch-plugin/         # Plugin integration
│   └── uimatch-selector-anchors/ # Optional selector resolution plugin
└── docs/                       # Documentation
```
