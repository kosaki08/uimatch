# @uimatch/selector-anchors

Selector resolution plugin for uiMatch using AST-based anchors.

## Installation

**This package requires both `@uimatch/selector-anchors` and `@uimatch/selector-spi` to be installed:**

```bash
npm install @uimatch/selector-anchors @uimatch/selector-spi
# or
pnpm add @uimatch/selector-anchors @uimatch/selector-spi
# or
bun add @uimatch/selector-anchors @uimatch/selector-spi
```

**Requirements:**

- **Node.js**: `>=20.19` or `>=22.12`
- **TypeScript**: This package includes TypeScript as a runtime dependency for AST-based selector resolution
- **Module System**: ESM only (CommonJS is not supported)
  - Dynamic import is supported: `import('@uimatch/selector-anchors')`
  - `require()` will not work

## Overview

This package provides intelligent selector resolution by analyzing source code (TypeScript/JSX/HTML) and maintaining anchor points that survive code refactoring and line number changes.

## Features

- **AST-based Resolution**: Extract semantic selectors from TypeScript/JSX and HTML
- **Snippet Hash Matching**: Detect code movement using fuzzy matching
- **Liveness Checking**: Verify selectors work in the browser
- **Stability Scoring**: Calculate selector quality (0-100)
- **SPI Compliance**: Pluggable architecture via SPI interface

## Health Check

The plugin provides a `healthCheck()` method to verify runtime dependencies:

- TypeScript compilation is **required** (returns `healthy=false` if `tsc` fails)
- `parse5` (HTML parsing) is **optional** by default (warnings are logged but `healthy=true`)
- When `UIMATCH_HEALTHCHECK_STRICT_HTML=true` is set, `parse5` becomes **required** and `healthy=false` will be returned if unavailable

This allows TypeScript-only projects to use the plugin without HTML parsing capabilities.

## Usage

### CLI Tool

The package provides a command-line tool for adding anchors to `anchors.json`:

```bash
# Add a new anchor
npx uimatch-anchors --file src/components/Button.tsx --line 10 --column 2 --id button-root

# Overwrite existing anchor
npx uimatch-anchors --file src/components/Button.tsx --line 10 --column 2 --id button-root --force

# Custom output file
npx uimatch-anchors --file src/components/Button.tsx --line 10 --column 2 --id button-root --output custom.json

# Show help
npx uimatch-anchors --help
```

**Note**: The CLI automatically generates snippet hashes from the specified source code location. Once anchors are created, you should commit `anchors.json` to your repository for team collaboration.

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

**Fuzzy Matching**: When original line number no longer matches, searches nearby lines in the same file using partial match scoring (80% token match + 20% char match). Default threshold: 0.55 (recommended: 0.6 for stricter matching; configurable via `UIMATCH_SNIPPET_FUZZY_THRESHOLD`). Exact match only (without original snippet).

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

**Weight Normalization:**

The plugin automatically normalizes weights to ensure they sum to 1.0. You can specify any positive numbers, and they will be proportionally adjusted:

```bash
# These weights (sum=10) will be normalized to (0.4, 0.2, 0.3, 0.1)
export UIMATCH_STABILITY_HINT_WEIGHT=4
export UIMATCH_STABILITY_SNIPPET_WEIGHT=2
export UIMATCH_STABILITY_LIVENESS_WEIGHT=3
export UIMATCH_STABILITY_SPECIFICITY_WEIGHT=1
```

**Priority:** Programmatic options (via `stabilityScoreOptions`) > Environment variables > Default values

## Configuration

### Timeout Settings

The plugin uses configurable timeouts for various operations. You can adjust these via environment variables:

**AST Parsing Timeouts:**

The AST resolution uses a tiered fallback strategy with three timeout levels:

```bash
# Fast path timeout (tag + data-testid/id only) - default: 300ms
export UIMATCH_AST_FAST_PATH_TIMEOUT_MS=300

# Attribute-only parsing timeout (all attributes, no text) - default: 600ms
export UIMATCH_AST_ATTR_TIMEOUT_MS=600

# Full parse timeout (everything including text) - default: 900ms
export UIMATCH_AST_FULL_TIMEOUT_MS=900
```

**Other Timeouts:**

```bash
# Liveness probe timeout - default: 600ms
export UIMATCH_PROBE_TIMEOUT_MS=600

# HTML parsing timeout - default: 300ms
export UIMATCH_HTML_PARSE_TIMEOUT_MS=300

# Snippet hash matching timeout - default: 50ms
export UIMATCH_SNIPPET_MATCH_TIMEOUT_MS=50
```

**Snippet Matching Configuration:**

```bash
# Maximum search radius for snippet matching (lines) - default: 400
export UIMATCH_SNIPPET_MAX_RADIUS=400

# High confidence threshold for early exit (0.0-1.0) - default: 0.92
export UIMATCH_SNIPPET_HIGH_CONFIDENCE=0.92

# Fuzzy matching threshold (0.0-1.0) - default: 0.55
export UIMATCH_SNIPPET_FUZZY_THRESHOLD=0.55
```

**Debug Logging:**

Enable debug logging via the `DEBUG` environment variable:

```bash
# Enable all uimatch debug logs
export DEBUG=uimatch:*

# Enable only selector-anchors logs
export DEBUG=uimatch:selector-anchors
```

## Integration Notes

**Text Matching (uiMatch Plugin)**: テキスト一致確認は `uimatch-plugin` の `/uiMatch compare` で提供されます（`textCheck` オプション）。
`mode: 'self' | 'descendants'` / `normalize: 'none' | 'nfkc' | 'nfkc_ws'` / `match: 'exact' | 'contains' | 'ratio'` / `minRatio: 0.98`。

**Role Selector Resolution**: `role:button[name="Submit"]` は `getByRole()` を使用。`checked/selected/...` などのブーリアンは CSS フォールバックを採用。

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
      "resolvedCss": "button[data-testid='button-primary']",
      "lastSeen": "2024-01-15T10:30:00Z",
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
- `resolvedCss`: Last resolved CSS selector (write-back cache for fast lookup)
- `lastSeen`: Timestamp when the selector was last successfully resolved
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

**Path Aliases**: `#anchors/*` resolved via esbuild (build) and `imports` field (runtime)

## License

MIT
