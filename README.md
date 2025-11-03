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

## Requirements

- **Runtime**: Node.js >=22.11.0 (npm package) or Bun (development)
- **Browser**: Playwright Chromium (peer dependency, install once)

## Installation

```bash
# Claude Code plugin
/plugin install uimatch
bunx playwright install chromium

# Or as global CLI
npm install -g uimatch-plugin playwright
npx playwright install chromium
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
bun run uimatch:settings -- set comparison.acceptancePixelDiffRatio=0.01
bun run uimatch:settings -- reset
```

## Configuration

Create `.uimatchrc.json` in your project root:

```json
{
  "comparison": {
    "pixelmatchThreshold": 0.1,
    "acceptancePixelDiffRatio": 0.01,
    "acceptanceColorDeltaE": 3.0
  }
}
```

**Environment variables:**

- `UIMATCH_HEADLESS` - Control browser headless mode (default: `true`)
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` - Basic auth credentials for target URLs

## Quick Verification

Smoke test without Figma/Storybook (expects `DFS: X.XX`):

```bash
bun run build
node packages/uimatch-plugin/dist/cli/index.js compare \
  figma=bypass:test \
  story="data:text/html,<div style='width:10px;height:10px;background:red'></div>" \
  selector="div" dpr=1 size=pad
```

Bypass mode uses `UIMATCH_FIGMA_PNG_B64` env var (useful for CI).

## CI Integration

**GitHub Actions example:**

```yaml
- name: Install Playwright
  run: npx playwright install chromium --with-deps
- name: Smoke test
  run: npx uimatch compare figma=bypass:test story="..." selector="..."
  env:
    UIMATCH_FIGMA_PNG_B64: ${{ secrets.TEST_PNG_B64 }}
```

**Important:**

- Use `--with-deps` for system dependencies
- Cache Playwright browsers for faster runs
- Set `UIMATCH_HEADLESS=true` (default) for CI
- Bypass mode avoids Figma API rate limits

## Local Testing

**Pack (pre-publish check):**

```bash
bun run build && cd packages/uimatch-plugin && npm pack
npm i -g ./uimatch-plugin-*.tgz playwright && npx playwright install chromium
npx uimatch compare figma=bypass:test story="..." selector="..."
```

**Link (dev iteration):**

```bash
cd packages/uimatch-plugin && bun link
bun link uimatch-plugin  # in consumer project
```

## Development

```bash
# Install dependencies
bun install

# Build all packages (required before testing)
bun run build

# Run tests
bun test

# Lint and format
bun run lint
bun run format
```

## Troubleshooting

### Common Issues

| Issue                       | Cause                                          | Solution                                                 |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Browser not found           | Playwright Chromium not installed              | `npx playwright install chromium`                        |
| Module 'typescript' missing | Runtime dep in devDependencies                 | `npm i -g typescript` or move to dependencies            |
| Storybook wrong URL         | Canvas URL instead of iframe                   | Use `iframe.html?id=...` not `?path=/story/...`          |
| Link broken                 | `node_modules` regenerated or path moved       | `bun unlink && bun link` or use pack method              |
| Bypass mode fails           | `UIMATCH_FIGMA_PNG_B64` not set                | Export base64-encoded PNG (10x10 red square for testing) |
| Runtime dependency missing  | Package installed with wrong dependency type   | Check `package.json`: runtime deps → `dependencies`      |
| ESM resolution failure      | Incorrect module format in distributed package | Test with `npm pack` before publishing                   |
| CLI not executable          | Shebang or bin path incorrect                  | Verify `bin` in package.json and `#!/usr/bin/env node`   |

### Pre-Publish Checklist

Before `npm publish`, verify with pack:

```bash
npm pack && npm i -g ./uimatch-plugin-*.tgz
npx uimatch compare figma=bypass:test story="..." selector="..."
```

**Critical checks:**

- Runtime dependencies in `dependencies` (not `devDependencies`)
- ESM/CJS module resolution works
- CLI executable and shebang correct
- No secrets in package (check with `npm pack --dry-run`)

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
