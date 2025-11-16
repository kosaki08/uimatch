# uiMatch

[![CI](https://github.com/kosaki08/uimatch/actions/workflows/ci.yml/badge.svg)](https://github.com/kosaki08/uimatch/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/kosaki08/uimatch/branch/main/graph/badge.svg)](https://codecov.io/gh/kosaki08/uimatch)

> ⚠️ **Status: Experimental / 0.x**
> This project is in early development. APIs may change without notice and are not production-ready.
> Feedback and contributions are welcome!

**TL;DR**: uiMatch automates Figma-to-implementation comparison with Playwright, calculating pixel-level color differences (ΔE), dimensional accuracy, spacing, typography, and layout discrepancies. Reports are generated with numerical scores, annotated screenshots, and CI integration support.

Design-to-implementation comparison tool that evaluates how closely an implemented UI matches a Figma design.

## Quick Navigation by Role

**👤 Using uiMatch (CI/Local Testing)**
→ See [Installation](#installation) and [Quickstart](#quickstart) for getting started
→ See [CI Integration](#ci-integration) for GitHub Actions setup
→ See [Configuration](#configuration) for settings

**👨‍💻 Contributing / OSS Development**
→ See [Development](#development) for local setup
→ See [Local Testing](#local-testing) for pack/link workflows
→ See [Project Structure](#project-structure) for codebase overview

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        uiMatch Workflow                         │
└─────────────────────────────────────────────────────────────────┘

  Figma Design           Implementation         Selector Engine
  ────────────           ──────────────         ───────────────
       │                       │                       │
       │ 3 MODES:              │ Storybook/URL         │ Optional
       │ • BYPASS (env var)    │                       │
       │ • REST (token)        │                       │
       │ • MCP (figma server)  │                       │
       ▼                       ▼                       ▼
  ┌─────────┐           ┌──────────┐          ┌──────────────┐
  │ Figma   │           │ Playwright│          │  Anchors     │
  │ API     │◄──────────┤ Browser  │◄─────────┤  Plugin      │
  └────┬────┘           └────┬─────┘          │ (AST-based)  │
       │                     │                 └──────────────┘
       │  PNG Frame          │  Screenshot              │
       │                     │  + CSS props             │
       ▼                     ▼                          │
  ┌─────────────────────────────────────────┐          │
  │         @uimatch/core Engine             │          │
  │  ┌───────────────────────────────────┐  │          │
  │  │ Size Handler (strict/pad/crop)    │  │          │
  │  │ Content Basis (union/intersection)│  │          │
  │  └───────────────────────────────────┘  │          │
  │  ┌───────────────────────────────────┐  │          │
  │  │ Pixelmatch (content-aware)        │  │          │
  │  │ Color ΔE2000 (perceptual)         │  │          │
  │  └───────────────────────────────────┘  │          │
  │  ┌───────────────────────────────────┐  │          │
  │  │ Quality Gate V2                   │  │          │
  │  │ • pixelDiffRatioContent < 1%      │◄─┼──────────┘
  │  │ • areaGapRatio < 5%               │  │ Stable selectors
  │  │ • CQI (content quality index)     │  │ reduce drift
  │  └───────────────────────────────────┘  │
  └──────────────────┬──────────────────────┘
                     │
                     │ JSON + Screenshots
                     ▼
            ┌─────────────────┐
            │  DFS Score       │  Design Fidelity Score (0-100)
            │  Reports         │  Pass/Fail + Annotated Images
            └─────────────────┘
                     │
                     │
                     ▼
            [ CI/CD Integration ]
```

**Figma Integration Modes**:

- **BYPASS**: Use `UIMATCH_FIGMA_PNG_B64` env var (useful for CI, avoids API rate limits)
- **REST**: Use `FIGMA_ACCESS_TOKEN` for direct Figma API access
- **MCP**: Use `figma=current` with MCP server for enhanced integration

**Key Components:**

- **@uimatch/cli**: CLI entry point (`npx uimatch compare`)
- **@uimatch/core**: Comparison engine (pixelmatch, color ΔE, scoring)
- **@uimatch/selector-anchors**: Optional plugin for stable selector resolution
- **Quality Gate V2**: Content-aware pass/fail criteria (recommended)

## Features

- **Pixel-perfect comparison**: Visual diff with pixelmatch
- **Style analysis**: CSS property comparison with color ΔE2000
- **Design tokens**: Token mapping for consistent design system
- **Figma integration**: Direct Figma MCP integration for frame capture
- **Quality scoring**: Design Fidelity Score (DFS 0-100)
- **Selector Resolution**: Extensible plugin architecture for stable selector resolution
- **Browser reuse**: Automatic browser pooling for faster iteration

## Requirements

- **Runtime**: Node.js 20.19+ / 22.12+ (ESM only)
- **Package Manager**: pnpm 9.15.4+ (for development)
- **Browser**: Playwright Chromium (peer dependency, install once)

## Public Packages

**Ready for publish:**

- `@uimatch/cli` - CLI entry point and commands
- `@uimatch/selector-anchors` - AST-based selector resolution plugin
- `@uimatch/selector-spi` - Plugin interface types
- `@uimatch/shared-logging` - Logging utilities

**Internal (private: true):**

- `@uimatch/core` - Comparison engine
- `@uimatch/scoring` - Design Fidelity Score calculator

## Installation

```bash
# As npm package (recommended)
npm install -g @uimatch/cli playwright
npx playwright install chromium
```

## Quickstart

### 10-Minute Setup

**Option A: CLI-only** (fastest)

```bash
# Install and verify
npm install -g @uimatch/cli playwright
npx playwright install chromium
export FIGMA_ACCESS_TOKEN="figd_..."

# Run comparison (prints results to stdout)
npx uimatch compare \
  figma=<fileKey>:<nodeId> \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button"

# Save artifacts to directory (optional)
npx uimatch compare \
  figma=<fileKey>:<nodeId> \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button" \
  outDir=./uimatch-reports
```

**Option B: With Anchors** (stable selectors)

```bash
# Install with selector plugin
npm install -g @uimatch/cli @uimatch/selector-anchors playwright
npx playwright install chromium

# Create anchors.json (see examples/anchors-stabilization.md)
npx uimatch-anchors --file src/Button.tsx --line 10 --id btn-primary

# Run with anchors
npx uimatch compare \
  figma=... story=... selector=... \
  selectors=./anchors.json
```

### Common Patterns

```bash
# Component vs Component (strict pixel-perfect)
npx uimatch compare figma=... story=... selector=... size=strict

# Page vs Component (pad + contentBasis to reduce noise)
npx uimatch compare figma=... story=... selector=... \
  size=pad contentBasis=intersection

# Suite mode (batch comparison)
npx uimatch suite path=suite-config.json
```

**See also**: [Getting Started](https://kosaki08.github.io/uimatch/docs/getting-started) | [CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference) | [Common Options](#common-options)

## Usage

### CLI

```bash
# Compare Figma design with implementation
npx uimatch compare figma=<fileKey>:<nodeId> story=<url> selector=<css>

# With selector anchors plugin
npx uimatch compare figma=... story=... selector=... selectors=./anchors.json

# Batch comparison (suite mode)
npx uimatch suite path=suite-config.json

# Verify installation (smoke test)
npx uimatch doctor

# Development (from repository)
pnpm uimatch:compare -- figma=AbCdEf:1-23 story=http://localhost:6006/?path=/story/button selector="#root button"
```

**Output directory defaults:**

- `compare`: No default (prints to stdout unless `outDir` specified)
- `suite`: `.uimatch-suite` (can be overridden with `outDir=<path>`)

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

- `FIGMA_ACCESS_TOKEN` - Required for Figma API access
- `UIMATCH_HEADLESS` - Control browser headless mode (default: `true`)
  - Set to `false` to show browser window during execution (useful for debugging)
  - Applies to `compare`, `suite`, and `doctor` commands
- `UIMATCH_LOG_LEVEL` - Logging verbosity: `info` | `debug` | `silent` (default: `info`)
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` - Basic auth credentials for target URLs

## Quick Verification

Smoke test without Figma/Storybook (expects `DFS: X.XX`):

```bash
pnpm build
node packages/uimatch-cli/dist/cli/index.js compare \
  figma=bypass:test \
  story="data:text/html,<div style='width:10px;height:10px;background:red'></div>" \
  selector="div" dpr=1 size=pad
```

Bypass mode uses `UIMATCH_FIGMA_PNG_B64` env var (useful for CI).

## CI Integration

**Minimal GitHub Actions example:**

```yaml
name: uiMatch QA
on: [pull_request]

jobs:
  compare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: |
          npm install -g @uimatch/cli playwright
          npx playwright install --with-deps chromium

      - name: Run comparison
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_TOKEN }}
          UIMATCH_HEADLESS: true
        run: |
          npx uimatch compare \
            figma=${{ secrets.FIGMA_FILE }}:${{ secrets.FIGMA_NODE }} \
            story=https://your-storybook.com/?path=/story/button \
            selector="#root button" \
            outDir=uimatch-reports

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: uimatch-reports
          path: uimatch-reports/
```

**Tips:**

- Use `--with-deps` for system dependencies
- Cache Playwright browsers with `actions/cache@v4`
- Set `UIMATCH_HEADLESS=true` (default) for CI
- Use bypass mode (`figma=bypass:test` + `UIMATCH_FIGMA_PNG_B64`) to avoid API rate limits

## Local Testing

### Method 1: Pack (recommended for pre-publish verification)

This simulates actual npm distribution and catches dependency issues:

```bash
# Build all packages first
pnpm build

# Create tarballs (pnpm automatically resolves workspace:* to versions)
mkdir -p dist-packages
pnpm -C packages/shared-logging pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-selector-spi pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-core pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-scoring pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-selector-anchors pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-cli pack --pack-destination ../../dist-packages

# Test in isolated environment
mkdir -p /tmp/uimatch-test && cd /tmp/uimatch-test
npm init -y
npm install \
  /path/to/uimatch/dist-packages/uimatch-shared-logging-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-selector-spi-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-core-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-scoring-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-selector-anchors-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-cli-*.tgz \
  playwright

npx playwright install chromium

# Verify with smoke test
export UIMATCH_FIGMA_PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC"
npx uimatch compare figma=bypass:test \
  story="data:text/html,<div id='t' style='width:10px;height:10px;background:red'></div>" \
  selector="#t" dpr=1 size=pad
```

**Note**: pnpm pack automatically resolves `workspace:*` to actual versions during pack.

### Method 2: Link (for rapid iteration)

```bash
# Register packages globally
cd packages/shared-logging && pnpm link --global && cd ../..
cd packages/uimatch-selector-spi && pnpm link --global && cd ../..
cd packages/uimatch-core && pnpm link --global && cd ../..
cd packages/uimatch-scoring && pnpm link --global && cd ../..
cd packages/uimatch-selector-anchors && pnpm link --global && cd ../..
cd packages/uimatch-cli && pnpm link --global && cd ../..

# Link in consumer project
cd /path/to/consumer
pnpm link --global @uimatch/shared-logging
pnpm link --global @uimatch/selector-spi
pnpm link --global @uimatch/core
pnpm link --global @uimatch/scoring
pnpm link --global @uimatch/selector-anchors
pnpm link --global @uimatch/cli

# Unlink when done
pnpm unlink --global @uimatch/cli  # in consumer
cd packages/uimatch-cli && pnpm unlink --global  # in source
```

**Note**: Links persist across shell restarts but break if source paths move or `node_modules` is regenerated.

## Development

**Prerequisites**:

- **Node.js**: 20.19+ / 22.12+ (recommended: 22.12+)
- **pnpm**: 9.15.4+
- **Bun**: 1.x (used for script execution and test runner)

```bash
# Install dependencies
pnpm install

# Build all packages (required before testing)
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage           # Text output to console
pnpm test:coverage:html      # Generate lcov report in ./coverage/

# Lint and format
pnpm lint
pnpm format
```

### Test Coverage

Generate coverage reports for observation and CI artifacts:

```bash
pnpm test:coverage       # Text summary to console
pnpm test:coverage:html  # LCOV report in ./coverage/
```

View reports with Coverage Gutters (VS Code), Codecov, or Coveralls.

**No thresholds yet** — observe coverage trends first, then set thresholds for core packages after analysis.

## Troubleshooting

### Doctor Command

Run `npx uimatch doctor` to diagnose installation issues:

```bash
$ npx uimatch doctor

✅ Environment Check
   Node.js: v22.12.0 (✓ >= 20.19.0)
   npm: 10.9.0
   Platform: darwin (arm64)

✅ Playwright Installation
   @playwright/test: 1.49.1
   Chromium: installed (1148)

✅ Figma Configuration
   FIGMA_ACCESS_TOKEN: ✓ Set (figd_***)

⚠️  Optional Dependencies
   TypeScript: not found (required for anchors plugin AST resolution)
   → npm install -g typescript

✅ System Ready
   All critical checks passed. Optional: install TypeScript for anchors.
```

### Common Issues

| Issue                      | Symptom                                        | Solution                                                 |
| -------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Browser not found          | ❌ Playwright: Chromium not installed          | `npx playwright install chromium`                        |
| Figma token missing        | ❌ FIGMA_ACCESS_TOKEN not set                  | `export FIGMA_ACCESS_TOKEN="figd_..."`                   |
| TypeScript missing         | ⚠️ TypeScript: not found                       | `npm install -g typescript` (for anchors plugin)         |
| Browser window needed      | Want to see browser during execution           | `export UIMATCH_HEADLESS=false`                          |
| Storybook wrong URL        | Canvas URL instead of iframe                   | Use `iframe.html?id=...` not `?path=/story/...`          |
| Bypass mode fails          | `UIMATCH_FIGMA_PNG_B64` not set                | Export base64-encoded PNG (10x10 red square for testing) |
| Runtime dependency missing | Package installed with wrong dependency type   | Check `package.json`: runtime deps → `dependencies`      |
| ESM resolution failure     | Incorrect module format in distributed package | Test with `npm pack` before publishing                   |
| CLI not executable         | Shebang or bin path incorrect                  | Verify `bin` in package.json and `#!/usr/bin/env node`   |

### Publishing to npm

**Primary method**: Changesets for version management and coordinated releases.

```bash
# 1. Create changeset for changes
pnpm changeset

# 2. Version packages (updates versions and CHANGELOG)
pnpm changeset version

# 3. Build all packages
pnpm build

# 4. Publish all changed packages
pnpm publish -r
```

**Manual publish** (if needed):

```bash
pnpm -C packages/shared-logging publish --access public
pnpm -C packages/uimatch-selector-spi publish --access public
# Note: uimatch-core and uimatch-scoring are currently private
# Remove "private": true from package.json before publishing:
# pnpm -C packages/uimatch-core publish --access public
# pnpm -C packages/uimatch-scoring publish --access public
pnpm -C packages/uimatch-selector-anchors publish --access public
pnpm -C packages/uimatch-cli publish --access public
```

**Note**: pnpm resolves `workspace:*` to actual versions automatically during publish.

### Pre-Publish Checklist

Before publishing, verify distribution integrity:

```bash
# Test with pack method (see Local Testing section)
pnpm build
# ... run full pack verification from Local Testing section

# Or quick smoke test
pnpm -C packages/uimatch-cli pack --pack-destination ../../
npm i -g ./uimatch-cli-*.tgz
npx uimatch compare figma=bypass:test story="..." selector="..."
```

**Critical checks:**

- ✅ Runtime dependencies in `dependencies` (not `devDependencies`)
- ✅ ESM/CJS module resolution works (test with Node.js directly)
- ✅ CLI executable with correct shebang (`#!/usr/bin/env node`)
- ✅ No secrets in package (`npm pack --dry-run` to review contents)
- ✅ All workspace dependencies resolved (publish from root, not subdirs)
- ✅ Playwright peer dependency documented in README

## Common Options

| Option                     | Values                          | Use Case                                        |
| -------------------------- | ------------------------------- | ----------------------------------------------- |
| `size`                     | `strict/pad/crop/scale`         | Size handling strategy                          |
| `contentBasis`             | `union/intersection/figma/impl` | Content-aware comparison basis (default: union) |
| `selectors`                | `path/to/anchors.json`          | Use selector anchors plugin                     |
| `selectorsPlugin`          | `@uimatch/selector-anchors`     | Custom selector resolution plugin               |
| `acceptancePixelDiffRatio` | `0.01`                          | Quality gate v2 threshold (1% recommended)      |

**Full options**: Run `npx uimatch compare --help`

## Quality Gate Profiles

UI Match uses quality gate profiles to manage thresholds instead of individual CLI flags.

| Profile             | Use Case                 | pixelDiffRatio | deltaE | Description               |
| ------------------- | ------------------------ | -------------- | ------ | ------------------------- |
| `component/strict`  | Design system components | 0.01 (1%)      | 3.0    | Pixel-perfect comparison  |
| `component/dev`     | Development workflow     | 0.08 (8%)      | 5.0    | Relaxed for iteration     |
| `page-vs-component` | Padded comparisons       | 0.12 (12%)     | 5.0    | Accounts for letterboxing |
| `lenient`           | Prototyping              | 0.15 (15%)     | 8.0    | Very relaxed thresholds   |
| `custom`            | Custom settings          | -              | -      | Uses `.uimatchrc.json`    |

**Usage:**

```bash
# Pixel-perfect comparison
npx uimatch compare figma=... story=... selector=... profile=component/strict

# Development workflow
npx uimatch compare figma=... story=... selector=... profile=component/dev
```

For more details, see the [CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference#quality-gate-profiles).

## Experimental Features

⚠️ **Warning**: The following features are **experimental** and may change or be removed without notice.

These are primarily intended for MCP / AI assistant integration experiments. Please avoid relying on them in long-term CI/CD pipelines yet.

### Experimental Commands

- `uimatch experimental claude-report` - Generate Claude-optimized comparison report
  - `--format=prompt` - Output as LLM prompt (default)
  - `--format=json` - Output as structured JSON

**Example**:

```bash
uimatch experimental claude-report --figma current --url http://localhost:3000 --format=json
```

### Experimental Configuration

In `.uimatchrc.json`:

```json
{
  "experimental": {
    "claude": {
      "format": "prompt",
      "includeRawDiffs": false
    },
    "mcp": {
      "enabled": false
    }
  }
}
```

### Experimental TypeScript API

```typescript
import { experimental } from '@uimatch/cli';

// Claude-specific formatting
const payload = experimental.formatForLLM(result, { preferTokens: true });
const prompt = experimental.generateLLMPrompt(payload);

// Figma MCP client (requires MCP server running)
const mcpClient = new experimental.FigmaMcpClient(config);
const ref = await mcpClient.getCurrentSelectionRef();
```

## Documentation

For comprehensive documentation, visit the [uiMatch Documentation Site](https://kosaki08.github.io/uimatch/).

### Quick Start

- [Getting Started](https://kosaki08.github.io/uimatch/docs/getting-started) - Installation and quickstart guide
- [CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference) - Detailed command reference

### Core Concepts

- [Concepts](https://kosaki08.github.io/uimatch/docs/concepts) - Anchors, Quality Gates, and Content Basis

### Advanced

- [Plugins](https://kosaki08.github.io/uimatch/docs/plugins) - Plugin development guide
- [Troubleshooting](https://kosaki08.github.io/uimatch/docs/troubleshooting) - Common issues and solutions

## Project Structure

```
ui-match/
├── .github/                      # CI workflows and utility scripts
├── .claude-plugin/               # (optional) Claude Code / MCP plugin definition [experimental]
├─┬ packages/
│ ├── uimatch-core/               # Core comparison engine (image + style diff, quality gate)
│ ├── uimatch-scoring/            # Design Fidelity Score (DFS) calculation (internal)
│ ├── uimatch-selector-spi/       # Selector resolver plugin interface (public)
│ ├── uimatch-selector-anchors/   # AST-based selector plugin (public)
│ ├── uimatch-cli/                # CLI tool (+ optional AI / Claude Code integration)
│ └── shared-logging/             # Shared logging utilities (public)
└── docs/                         # Documentation site and examples
```

## License

MIT © 2025 Kazunori Osaki
