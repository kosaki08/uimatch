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

# Note: CLI does not have a settings subcommand
# Configure via .uimatchrc.json, programmatic API, or Claude's /uiMatch settings
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

### Method 1: Pack (recommended for pre-publish verification)

This simulates actual npm distribution and catches dependency issues:

```bash
# Build all packages first
bun run build

# Create tarballs for all workspace packages
cd packages/shared-logging && npm pack && cd ../..
cd packages/uimatch-selector-spi && npm pack && cd ../..
cd packages/uimatch-core && npm pack && cd ../..
cd packages/uimatch-scoring && npm pack && cd ../..
cd packages/uimatch-selector-anchors && npm pack && cd ../..
cd packages/uimatch-plugin && npm pack && cd ../..

# Test in isolated environment
mkdir -p /tmp/uimatch-test && cd /tmp/uimatch-test
npm init -y
npm install \
  /path/to/ui-match/packages/shared-logging/uimatch-shared-logging-*.tgz \
  /path/to/ui-match/packages/uimatch-selector-spi/uimatch-selector-spi-*.tgz \
  /path/to/ui-match/packages/uimatch-core/uimatch-core-*.tgz \
  /path/to/ui-match/packages/uimatch-scoring/uimatch-scoring-*.tgz \
  /path/to/ui-match/packages/uimatch-selector-anchors/uimatch-selector-anchors-*.tgz \
  /path/to/ui-match/packages/uimatch-plugin/uimatch-plugin-*.tgz \
  playwright

npx playwright install chromium

# Verify with smoke test
export UIMATCH_FIGMA_PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC"
npx uimatch compare figma=bypass:test \
  story="data:text/html,<div id='t' style='width:10px;height:10px;background:red'></div>" \
  selector="#t" dpr=1 size=pad
```

**Important**: All workspace dependencies must be installed simultaneously to resolve `workspace:*` protocol references.

### Method 2: Link (for rapid iteration)

```bash
# Register packages globally
cd packages/shared-logging && bun link && cd ../..
cd packages/uimatch-selector-spi && bun link && cd ../..
cd packages/uimatch-core && bun link && cd ../..
cd packages/uimatch-scoring && bun link && cd ../..
cd packages/uimatch-selector-anchors && bun link && cd ../..
cd packages/uimatch-plugin && bun link && cd ../..

# Link in consumer project
cd /path/to/consumer
bun link @uimatch/shared-logging
bun link @uimatch/selector-spi
bun link uimatch-core
bun link uimatch-scoring
bun link @uimatch/selector-anchors
bun link uimatch-plugin

# Unlink when done
bun unlink uimatch-plugin  # in consumer
cd packages/uimatch-plugin && bun unlink  # in source
```

**Note**: Links persist across shell restarts but break if source paths move or `node_modules` is regenerated.

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

### Publishing to npm

**Workspace protocol resolution**: `workspace:*` dependencies are automatically converted to semver ranges when using `npm publish` from workspace root.

```bash
# 1. Version all packages (consider using Changesets for coordinated releases)
npm version patch -w @uimatch/shared-logging
npm version patch -w @uimatch/selector-spi
npm version patch -w uimatch-core
npm version patch -w uimatch-scoring
npm version patch -w @uimatch/selector-anchors
npm version patch -w uimatch-plugin

# 2. Build all packages
bun run build

# 3. Publish in dependency order from workspace root
npm publish -w @uimatch/shared-logging --access public
npm publish -w @uimatch/selector-spi --access public
npm publish -w uimatch-core --access public
npm publish -w uimatch-scoring --access public
npm publish -w @uimatch/selector-anchors --access public
npm publish -w uimatch-plugin --access public
```

**Important**: Always publish from workspace root, not individual package directories. Publishing from subdirectories leaves `workspace:*` unresolved in distributed packages.

### Pre-Publish Checklist

Before publishing, verify distribution integrity:

```bash
# Test with pack method (see Local Testing section)
bun run build
# ... run full pack verification from Local Testing section

# Or quick smoke test from repo root
npm pack -w uimatch-plugin
npm i -g ./packages/uimatch-plugin/uimatch-plugin-*.tgz
npx uimatch compare figma=bypass:test story="..." selector="..."
```

**Critical checks:**

- ✅ Runtime dependencies in `dependencies` (not `devDependencies`)
- ✅ ESM/CJS module resolution works (test with Node.js directly)
- ✅ CLI executable with correct shebang (`#!/usr/bin/env node`)
- ✅ No secrets in package (`npm pack --dry-run` to review contents)
- ✅ All workspace dependencies resolved (publish from root, not subdirs)
- ✅ Playwright peer dependency documented in README

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
