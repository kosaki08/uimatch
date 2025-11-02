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

**Fuzzy Matching**: When original line number no longer matches, searches nearby lines in the same file using partial match scoring (80% token match + 20% char match). Default threshold: 0.6 (with original snippet) / exact match only (without original snippet).

### Stability Scoring

Stability scores (0-100) are calculated using weighted components:

**Default Weights:**

- **Hint Quality (0.4)**: Strategy preference quality (testid=1.0, role=0.8, text=0.5, css=0.3)
- **Snippet Match (0.2)**: Whether code snippet hash matched (1.0=matched, 0.0=not matched)
- **Liveness (0.3)**: Browser validation result (1.0=alive, 0.5=not checked, 0.0=dead)
- **Specificity (0.1)**: Selector specificity (data-testid=1.0, role[name]=0.9, id=0.6, text[5-24]=0.6, ...)

**Custom Weights:**

You can customize weights via the options parameter:

```typescript
const resolution = await plugin.resolve({
  // ... other options
  stabilityScoreOptions: {
    weights: {
      hintQuality: 0.3,
      snippetMatch: 0.3,
      liveness: 0.3,
      specificity: 0.1,
    },
  },
});
```

**Environment Variable Configuration:**

For production tuning, weights can be adjusted via environment variables:

```bash
export UIMATCH_STABILITY_HINT_WEIGHT=0.3
export UIMATCH_STABILITY_SNIPPET_WEIGHT=0.3
export UIMATCH_STABILITY_LIVENESS_WEIGHT=0.3
export UIMATCH_STABILITY_SPECIFICITY_WEIGHT=0.1
```

These variables are checked at runtime and override default values, enabling post-deployment tuning without code changes.

## Anchors JSON Format

### Minimal Example

The simplest anchors.json with required fields only:

```json
{
  "version": "1.0.0",
  "anchors": [
    {
      "id": "button-primary",
      "source": {
        "file": "src/components/Button.tsx",
        "line": 42,
        "col": 10
      }
    }
  ]
}
```

### Standard Example (Recommended)

Full-featured anchors.json with hints, snippet hash, and metadata:

```json
{
  "version": "1.0.0",
  "anchors": [
    {
      "id": "button-primary",
      "source": {
        "file": "src/components/Button.tsx",
        "line": 42,
        "col": 10
      },
      "hint": {
        "prefer": ["testid", "role", "text"],
        "testid": "button-primary",
        "role": "button",
        "expectedText": "Submit"
      },
      "snippetHash": "a3f2c9d8e1",
      "snippet": "export function Button({ variant = 'primary' }) {\n  return (\n    <button data-testid=\"button-primary\" role=\"button\">\n      Submit\n    </button>\n  );\n}",
      "snippetContext": {
        "contextBefore": 3,
        "contextAfter": 3,
        "algorithm": "sha1",
        "hashDigits": 10
      },
      "subselector": "button[data-testid='button-primary']",
      "lastKnown": {
        "selector": "button[data-testid='button-primary']",
        "timestamp": "2024-01-15T10:30:00Z",
        "stabilityScore": 95
      },
      "meta": {
        "component": "Button",
        "description": "Primary action button in header",
        "tags": ["interactive", "form"]
      }
    },
    {
      "id": "card-title",
      "source": {
        "file": "src/components/Card.tsx",
        "line": 18,
        "col": 6
      },
      "hint": {
        "prefer": ["role", "text"],
        "role": "heading",
        "expectedText": "Product Title"
      },
      "snippetHash": "b7e4d2c1f9",
      "snippetContext": {
        "contextBefore": 2,
        "contextAfter": 2,
        "algorithm": "sha1",
        "hashDigits": 10
      },
      "meta": {
        "component": "Card",
        "description": "Card heading element",
        "tags": ["typography", "heading"]
      }
    }
  ]
}
```

**Field Notes:**

- `snippetHash`: Auto-generated hash for code movement detection (fuzzy matching when line numbers change)
- `snippetContext`: Controls snippet extraction window (default: ±3 lines, sha1, 10 digits)
- `subselector`: Optional child element selector for Figma auto-ROI targeting
- `lastKnown`: Cached successful selector with timestamp and stability score
- `meta`: Human-readable metadata for organization and debugging

For complete schema details, see [`schema.ts`](./src/types/schema.ts).

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
