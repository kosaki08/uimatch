# @uimatch/cli

CLI tool for comparing Figma designs with implementation. Provides visual comparison and quality scoring.

## Features

- **Figma Integration**: Direct integration with Figma API and MCP server
- **Quality Scoring**: Design Fidelity Score (DFS) with configurable thresholds
- **Quality Gate Profiles**: Pixel-perfect, development, or lenient comparison modes
- **Extensible**: Plugin architecture for custom selector resolution

## Installation

```bash
# Global installation (recommended)
npm install -g @uimatch/cli playwright
npx playwright install chromium

# Or project-local installation
npm install -D @uimatch/cli playwright
npx playwright install chromium
```

## Quick Start

### Basic Comparison

```bash
npx uimatch compare \
  figma=AbCdEf123:456-789 \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button"
```

### With Quality Profile

```bash
npx uimatch compare \
  figma=AbCdEf123:456-789 \
  story=http://localhost:6006 \
  selector=".card" \
  profile=component/strict
```

### With Output Directory

```bash
npx uimatch compare \
  figma=AbCdEf123:456-789 \
  story=http://localhost:6006 \
  selector=".card" \
  outDir=./comparison-results
```

## Commands

### `compare`

Compare a single Figma design with implementation.

**Parameters:**

- `figma`: Figma file key and node ID (format: `fileKey:nodeId`)
- `story`: Implementation URL (Storybook, localhost, or deployed)
- `selector`: CSS selector for target element
- `profile`: (Optional) Quality profile - `component/strict` | `component/dev` | `page-vs-component` | `lenient` | `custom`
- `outDir`: (Optional) Output directory for artifacts (screenshots, diffs)

### `suite`

Run multiple comparisons from a JSON configuration file.

```bash
npx uimatch suite path=suite-config.json
```

### `doctor`

Diagnose installation and configuration issues.

```bash
npx uimatch doctor
```

## Programmatic API

```typescript
import { uiMatchCompare } from '@uimatch/cli';

const result = await uiMatchCompare({
  figma: 'AbCdEf123:456-789',
  story: 'http://localhost:6006',
  selector: '#button',
  profile: 'component/strict',
});

console.log(`DFS: ${result.dfs}`);
console.log(`Status: ${result.status}`);
```

## Configuration

Create `.uimatchrc.json` in your project root:

```json
{
  "comparison": {
    "acceptancePixelDiffRatio": 0.01,
    "acceptanceColorDeltaE": 3.0
  }
}
```

### Quality Gate Profiles

| Profile             | pixelDiffRatio | ΔE  | Use Case                |
| ------------------- | -------------- | --- | ----------------------- |
| `component/strict`  | 0.01 (1%)      | 3.0 | DS component validation |
| `component/dev`     | 0.08 (8%)      | 5.0 | Dev iteration           |
| `page-vs-component` | 0.12 (12%)     | 5.0 | Padded page comparison  |
| `lenient`           | 0.15 (15%)     | 8.0 | PoC/prototype           |
| `custom`            | (from config)  | -   | From settings file      |

### Environment Variables

```bash
FIGMA_ACCESS_TOKEN=your_token_here       # Required for Figma API
UIMATCH_HEADLESS=true|false              # Browser headless mode (default: true)
UIMATCH_LOG_LEVEL=info|debug|silent      # Logging verbosity (default: info)
```

## Documentation

For complete documentation, see the [uiMatch Documentation Site](https://kosaki08.github.io/uimatch/):

- **[Getting Started](https://kosaki08.github.io/uimatch/docs/getting-started)** - Installation and quickstart
- **[CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference)** - Complete command reference and options
- **[Concepts](https://kosaki08.github.io/uimatch/docs/concepts)** - Quality gates, scoring layers, and workflows
- **[Troubleshooting](https://kosaki08.github.io/uimatch/docs/troubleshooting)** - Common issues
- **[Plugins](https://kosaki08.github.io/uimatch/docs/plugins)** - Custom selector plugins
- **[API Reference](https://kosaki08.github.io/uimatch/docs/api)** - TypeScript API documentation

## License

MIT © 2025 Kazunori Osaki
