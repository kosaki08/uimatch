# uiMatch

Design-to-implementation comparison tool that evaluates how closely an implemented UI matches a Figma design. Distributed as a Claude Code plugin.

## Features

- **Pixel-perfect comparison**: Visual diff with pixelmatch
- **Style analysis**: CSS property comparison with color ΔE2000
- **Design tokens**: Token mapping for consistent design system
- **Figma integration**: Direct Figma MCP integration for frame capture
- **Quality scoring**: Design Fidelity Score (DFS 0-100)
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
├── .claude-plugin/        # Plugin definition
│   ├── plugin.json
│   ├── commands/          # /uiMatch commands
│   └── mcp.json           # Figma MCP integration
├── packages/
│   ├── uimatch-core/      # Core comparison library
│   └── uimatch-plugin/    # Plugin integration
└── docs/specs/            # Specifications
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Lint and format
bun run lint
bun run format
```

## Documentation

- [v0.1 Specification](docs/specs/v0.1.md) - MVP implementation spec
- [AGENTS.md](AGENTS.md) - AI assistant guidelines

## Requirements

- Bun or Node.js >=22.11.0
- Playwright (auto-installed via postinstall)

## Configuration

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

## Browser Reuse

The `/uiMatch loop` command automatically reuses browser instances for improved performance:

- Browser is launched once and shared across iterations
- Each comparison uses a lightweight browser context
- Automatic cleanup when loop completes
- Reduces iteration time from ~2s to ~500ms per comparison
