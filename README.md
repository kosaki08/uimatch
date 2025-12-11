# uiMatch

[![CI](https://github.com/kosaki08/uimatch/actions/workflows/ci.yml/badge.svg)](https://github.com/kosaki08/uimatch/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/kosaki08/uimatch/branch/main/graph/badge.svg)](https://codecov.io/gh/kosaki08/uimatch)

> ⚠️ **Status: Experimental / 0.x**
> This project is in early development. APIs may change without notice and are not production-ready.
> Feedback and contributions are welcome!

Design-to-implementation comparison tool that evaluates how closely an implemented UI matches a Figma design with pixel-level precision, color accuracy (ΔE2000), and automated quality scoring.

---

## Documentation

**📖 [Full Documentation](https://kosaki08.github.io/uimatch/)**

- [Getting Started](https://kosaki08.github.io/uimatch/docs/getting-started) - Installation and quickstart
- [CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference) - Complete command options
- [Concepts](https://kosaki08.github.io/uimatch/docs/concepts) - Anchors, quality gates, content basis
- [CI Integration](https://kosaki08.github.io/uimatch/docs/ci-integration) - GitHub Actions and CI setup
- [Local Testing](https://kosaki08.github.io/uimatch/docs/local-testing) - Pack/link workflows for contributors
- [Troubleshooting](https://kosaki08.github.io/uimatch/docs/troubleshooting) - Common issues and solutions
- [Plugins](https://kosaki08.github.io/uimatch/docs/plugins) - Plugin development guide
- [Experimental Features](https://kosaki08.github.io/uimatch/docs/experimental) - MCP and AI integration
- [API Reference](https://kosaki08.github.io/uimatch/docs/api) - TypeScript API documentation

---

## Quick Start

### Installation

**Global install (for CLI usage):**

```bash
npm install -g @uimatch/cli playwright
npx playwright install chromium
export FIGMA_ACCESS_TOKEN="figd_..."
```

**Project install (for development/CI):**

```bash
npm install -D @uimatch/cli playwright
npx playwright install chromium
```

### First Comparison

**Note:** The examples below assume `@uimatch/cli` is already installed (globally or as a dev dependency).

```bash
npx @uimatch/cli compare \
  figma=<fileKey>:<nodeId> \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button"
```

**Try without installing:**

If you want to run a quick test without installation:

```bash
npx -p @uimatch/cli uimatch compare \
  figma=<fileKey>:<nodeId> \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button"
```

### Save Artifacts

```bash
npx @uimatch/cli compare \
  figma=<fileKey>:<nodeId> \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button" \
  outDir=./uimatch-reports
```

**👉 See [Getting Started](https://kosaki08.github.io/uimatch/docs/getting-started) for detailed setup**

---

## Features

- **Pixel-perfect comparison** - Visual diff with content-aware pixelmatch
- **Color accuracy** - Perceptual color difference with ΔE2000
- **Design Fidelity Score** - Automated 0-100 quality scoring (DFS)
- **Figma integration** - Direct API access, MCP server support, or bypass mode
- **Quality gates** - Configurable pass/fail thresholds with profiles
- **Stable selectors** - AST-based anchors plugin for refactor-resistant targeting
- **CI-ready** - GitHub Actions integration with caching and artifacts

---

## Common Usage Patterns

### Component vs Component (Strict)

```bash
npx @uimatch/cli compare \
  figma=... story=... selector=... \
  size=strict profile=component/strict
```

### Page vs Component (Padded)

```bash
npx @uimatch/cli compare \
  figma=... story=... selector=... \
  size=pad contentBasis=intersection
```

**👉 See [CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference) for selector anchors, suite mode, and all options**

---

## CI Integration

Minimal GitHub Actions example:

```yaml
name: uiMatch QA
on: [pull_request]

jobs:
  compare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install
        run: |
          npm install -g @uimatch/cli playwright
          npx playwright install --with-deps chromium

      - name: Compare
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_TOKEN }}
        run: |
          npx @uimatch/cli compare \
            figma=${{ secrets.FIGMA_FILE }}:${{ secrets.FIGMA_NODE }} \
            story=https://storybook.com/?path=/story/button \
            selector="#root button" \
            outDir=uimatch-reports \
            profile=component/strict

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: uimatch-reports
          path: uimatch-reports/
```

**👉 See [CI Integration Guide](https://kosaki08.github.io/uimatch/docs/ci-integration) for caching, bypass mode, suite configurations, and complete setup**

---

## Quality Gate Profiles

Built-in profiles for different use cases:

- `component/strict` - Pixel-perfect for design systems
- `component/dev` - Development tolerance
- `page-vs-component` - Loose layout comparison
- `page/text-doc` - Text-heavy pages (Terms, Privacy)

```bash
npx @uimatch/cli compare \
  figma=... story=... selector=... \
  profile=component/strict
```

**👉 See [CI Integration Guide](https://kosaki08.github.io/uimatch/docs/ci-integration#quality-gate-enforcement) for detailed thresholds and parameters**

---

## Architecture Overview

At a high level:

- Fetch frame PNG from Figma (API / MCP / bypass)
- Capture implementation screenshot via Playwright
- Compare pixels + styles in `@uimatch/core`
- Apply quality gates and compute DFS (0–100)
- Report pass/fail and diff artifacts (for CI)

**👉 See [Concepts - Architecture](https://kosaki08.github.io/uimatch/docs/concepts#architecture-overview) for detailed diagrams and component explanation**

---

## Development

### Prerequisites

- Node.js 20.19+ / 22.12+
- pnpm 9.15.4+
- Bun 1.x (test runner)

### Setup

```bash
pnpm install
pnpm build
pnpm test
```

### Verification

```bash
# Smoke test (no Figma/Storybook required)
pnpm build
node packages/uimatch-cli/dist/cli/index.js compare \
  figma=bypass:test \
  story="data:text/html,<div style='width:10px;height:10px;background:red'></div>" \
  selector="div" dpr=1 size=pad
```

**👉 See [Local Testing Guide](https://kosaki08.github.io/uimatch/docs/local-testing) for pack/link workflows**

---

## Troubleshooting

Run diagnostics:

```bash
npx @uimatch/cli doctor
```

**Common issues:**

| Issue               | Solution                               |
| ------------------- | -------------------------------------- |
| Browser not found   | `npx playwright install chromium`      |
| Figma token missing | `export FIGMA_ACCESS_TOKEN="figd_..."` |
| Want to see browser | `export UIMATCH_HEADLESS=false`        |

**👉 See [Troubleshooting Guide](https://kosaki08.github.io/uimatch/docs/troubleshooting) for complete solutions**

---

## Packages

**Public (npm):**

- `@uimatch/cli` - CLI tool
- `@uimatch/selector-anchors` - AST-based selector plugin
- `@uimatch/selector-spi` - Plugin interface types
- `@uimatch/shared-logging` - Logging utilities

**Internal:**

- `@uimatch/core` - Comparison engine
- `@uimatch/scoring` - DFS calculator

---

## Project Structure

```
ui-match/
├── packages/
│   ├── uimatch-cli/              # CLI entry point
│   ├── uimatch-core/             # Comparison engine
│   ├── uimatch-scoring/          # DFS calculation
│   ├── uimatch-selector-spi/     # Plugin interface
│   ├── uimatch-selector-anchors/ # AST plugin
│   └── shared-logging/           # Logging utils
└── docs/                         # Documentation site
```

---

## Experiments / Skills

These markdown-based skills support AI-assisted workflows (Claude Code) and provide task-focused guides and references.

- Visual Compare: `experiments/skills/uimatch-compare/SKILL.md`
- Suite (Batch): `experiments/skills/uimatch-suite/SKILL.md`
- Text Diff: `experiments/skills/uimatch-text-diff/SKILL.md`

Shared references:

- `experiments/skills/_shared/uimatch-advanced-settings.md`
- `experiments/skills/_shared/uimatch-common-env.md`

👉 Important: export `FIGMA_ACCESS_TOKEN` in your shell (the CLI does not read `.env` automatically).
👉 Prefer `FILE_KEY:NODE_ID` for Figma references; if you pass a full Figma URL, always quote it in the shell.

---

## Contributing

Contributions welcome! See [Local Testing](https://kosaki08.github.io/uimatch/docs/local-testing) for development workflows.

---

## License

MIT
