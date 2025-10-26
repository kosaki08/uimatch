# uiMatch

Design-to-implementation comparison tool that evaluates how closely an implemented UI matches a Figma design. Distributed as a Claude Code plugin.

## Features

- **Pixel-perfect comparison**: Visual diff with pixelmatch
- **Style analysis**: CSS property comparison with color ΔE2000
- **Design tokens**: Token mapping for consistent design system
- **Figma integration**: Direct Figma MCP integration for frame capture
- **Quality scoring**: Design Fidelity Score (DFS 0-100)

## Installation

```bash
# Add marketplace
/plugin marketplace add <org>/uimatch

# Install plugin
/plugin install uimatch
```

## Usage

```bash
# Compare Figma design with implementation
/uiMatch compare figma=<fileKey>:<nodeId> story=<url> selector=<css>

# Iterative comparison loop
/uiMatch loop figma=... story=... selector=... maxIters=5

# Configure settings
/uiMatch settings
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
