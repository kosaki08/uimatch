---
sidebar_position: 1
---

# Getting Started

Get up and running with uiMatch.

## What is uiMatch?

uiMatch is a visual regression testing tool that compares your Figma designs with your actual implementation. It helps you catch visual inconsistencies early in development.

**Key Features:**

- **Pixel-perfect comparison** between Figma and implementation
- **Flexible selector system** with custom anchor plugins
- **Quality gates** to enforce design consistency
- **CLI-first** workflow for CI/CD integration

## Quick Start

### Installation

```shell
# Global install (for CLI usage)
npm install -g @uimatch/cli playwright
npx playwright install chromium

# Or as dev dependency (for projects/CI)
npm install -D @uimatch/cli playwright
npx playwright install chromium
```

### Environment Setup

Create a `.env` file with your Figma access token:

```shell
FIGMA_ACCESS_TOKEN=your_figma_token_here
```

Get your token from [Figma Settings > Personal Access Tokens](https://www.figma.com/developers/api#access-tokens).

### Your First Comparison (Local App)

Run a simple comparison between a Figma design and your implementation:

```shell
npx uimatch compare \
  figma=https://www.figma.com/file/YOUR_FILE_KEY?node-id=YOUR_NODE_ID \
  story=http://localhost:3000/your-page \
  selector="#my-component"
```

**That's it!** uiMatch will:

1. Fetch the design from Figma
2. Capture a screenshot of your implementation
3. Compare them and generate a diff report

### Output

By default, UI Match outputs results to the console. To save comparison artifacts (screenshots, diff images, reports), specify an output directory:

```shell
npx uimatch compare \
  figma=... \
  story=... \
  selector=... \
  outDir=./results
```

For the `suite` command, the default output directory is `.uimatch-suite`.

## Next Steps

- **[CLI Reference](./cli-reference.md)** – Learn all CLI commands and options
- **[Concepts](./concepts.md)** – Understand anchors, quality gates, and more
- **[Troubleshooting](./troubleshooting.md)** – Common issues and solutions
- **[Plugins](./plugins.md)** – Extend UI Match with custom selectors

## Common Use Cases

### Storybook Integration

```shell
npx uimatch compare \
  figma=FILE_KEY:NODE_ID \
  story=http://localhost:6006/iframe.html?id=button--primary \
  selector="#storybook-root button"
```

### CI/CD Pipeline

```shell
npx uimatch suite path=suite.json
```

### Text-only Checks (Copy Validation)

For text-only validation without pixel comparison, use the `text-diff` command:

```shell
npx uimatch text-diff "Sign in" "SIGN  IN"
# → kind: 'whitespace-or-case-only', similarity: 1.0

npx uimatch text-diff "Submit" "Submt" --threshold=0.6
# → kind: 'normalized-match', similarity: 0.7+
```

This is useful for comparing Figma text content with implementation `textContent`.
See the [CLI Reference](./cli-reference.md#text-diff-command) for detailed options.
