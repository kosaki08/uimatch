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

uiMatch CLI requires the `FIGMA_ACCESS_TOKEN` environment variable for Figma API access. Get your token from [Figma Settings > Personal Access Tokens](https://www.figma.com/developers/api#access-tokens).

#### Direct Shell Usage

For direct CLI usage, export the environment variable:

```shell
export FIGMA_ACCESS_TOKEN=your_figma_token_here
npx uimatch compare ...
```

#### Using .env Files (Node Scripts Only)

If you're calling uiMatch from a Node.js script, you can use a `.env` file with `dotenv`:

```shell
# .env file
FIGMA_ACCESS_TOKEN=your_figma_token_here
```

```typescript
// scripts/compare.ts
import 'dotenv/config'; // Load .env before using uiMatch
import { uiMatchCompare } from '@uimatch/cli';

// Now the environment variable is available
await uiMatchCompare({ ... });
```

**Note:** The CLI itself does not automatically load `.env` files. You must either export the environment variable directly or use `dotenv` in your own scripts.

### Your First Comparison (Local App)

Run a simple comparison between a Figma design and your implementation:

```shell
npx @uimatch/cli compare \
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
npx @uimatch/cli compare \
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
npx @uimatch/cli compare \
  figma=FILE_KEY:NODE_ID \
  story=http://localhost:6006/iframe.html?id=button--primary \
  selector="#storybook-root button"
```

### CI/CD Pipeline

```shell
npx @uimatch/cli suite path=suite.json
```

### Text-only Checks (Copy Validation)

For text-only validation without pixel comparison, use the `text-diff` command:

```shell
npx @uimatch/cli text-diff "Sign in" "SIGN  IN"
# → kind: 'whitespace-or-case-only', similarity: 1.0

npx @uimatch/cli text-diff "Submit" "Submt" --threshold=0.6
# → kind: 'normalized-match', similarity: 0.7+
```

This is useful for comparing Figma text content with implementation `textContent`.
See the [CLI Reference](./cli-reference.md#text-diff-command) for detailed options.
