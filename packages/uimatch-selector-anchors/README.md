# @uimatch/selector-anchors

Selector resolution plugin for uiMatch using AST-based anchors.

## Overview

This package provides intelligent selector resolution by analyzing source code (TypeScript/JSX/HTML) and maintaining anchor points that survive code refactoring and line number changes.

## Features

- **AST-based Resolution**: Extract semantic selectors from TypeScript/JSX and HTML
- **Snippet Hash Matching**: Detect code movement using fuzzy matching
- **Liveness Checking**: Verify selectors work in the browser
- **Stability Scoring**: Calculate selector quality (0-100)
- **SPI Compliance**: Pluggable architecture via SPI interface

## Usage

### As a Plugin (Phase 3+)

```bash
uimatch compare \
  --selectors anchors.json \
  --selectors-plugin @uimatch/selector-anchors
```

### Direct Usage

```typescript
import plugin from '@uimatch/selector-anchors';

const resolution = await plugin.resolve({
  url: 'http://localhost:3000',
  initialSelector: '.my-button',
  anchorsPath: './anchors.json',
  probe: myProbeImplementation,
});

console.log(resolution.selector); // Best selector found
console.log(resolution.stabilityScore); // Quality score 0-100
console.log(resolution.reasons); // Selection reasoning
```

## How It Works

1. Load anchors JSON (source locations + hints)
2. Match code snippets (fuzzy match if code moved)
3. Extract selectors from AST/HTML
4. Verify liveness via Probe interface
5. Score stability and return best match

## Architecture

**Anchor Matching System**

- Multi-criteria scoring (exact match, testid, role, component metadata, snippet hash, stability)
- Best match selection from multiple anchors

**AST Resolution**

- TypeScript/JSX parsing with fallback strategies
- Selector extraction with stability scoring
- Snippet hash generation for code movement detection

**Integration**

- SPI-compliant plugin architecture
- CLI integration via `--selectors-plugin` flag
- Probe interface for liveness checking
- Write-back support for anchor updates

## License

MIT
