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

## Status

**Phase 2**: Package structure complete, basic integration ready.
**Phase 3**: CLI integration (upcoming).
**Phase 4**: Full resolution logic (upcoming).

## License

MIT
