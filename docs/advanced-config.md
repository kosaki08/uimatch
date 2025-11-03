# Advanced Configuration

This document contains design notes, internal algorithms, and tuning parameters for advanced users.

## Snippet Hash & Fuzzy Matching

The selector-anchors plugin uses **snippet hash** to track code locations even after line number changes:

**How it works:**

- Stores a hash of 3 lines before + target line + 3 lines after (7 lines total)
- If exact hash match fails, performs **fuzzy search** with exponential skip (±1, 2, 4, 8, ..., up to 400 lines)
- Compares snippet text similarity (80% token-based + 20% character-based)

**Design rationale:**

| Parameter         | Value | Reason                                                                                                                                                                                              |
| ----------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FUZZY_THRESHOLD` | 0.55  | Minimum 55% similarity required to accept fuzzy match. Balances between accepting legitimate code moves (e.g., refactoring with whitespace changes) vs. false positives (completely different code) |
| `MAX_RADIUS`      | 400   | Typical file length limit. Beyond 400 lines, code structure usually changes significantly enough that fuzzy matching becomes unreliable                                                             |
| `HIGH_CONFIDENCE` | 0.92  | 92%+ similarity triggers early exit to avoid unnecessary searching. Saves ~30-50% search time in common refactoring scenarios while maintaining high accuracy                                       |

**Environment variable overrides:**

```bash
export UIMATCH_SNIPPET_FUZZY_THRESHOLD=0.6      # Default: 0.55
export UIMATCH_SNIPPET_MAX_RADIUS=600           # Default: 400
export UIMATCH_SNIPPET_HIGH_CONFIDENCE=0.95     # Default: 0.92
```

**When to adjust:**

- **Increase threshold (0.6-0.7)**: Stricter matching for heavily refactored codebases to reduce false positives
- **Increase radius (600-800)**: Large files or monolithic components where code moves further
- **Decrease confidence (0.85-0.90)**: Faster search with slightly more exploration when code changes frequently

## Figma Child-Node Matching

When comparing DOM child elements with Figma child nodes (subselector mode), uiMatch uses a weighted scoring algorithm:

| Factor              | Weight | Purpose                                                                 |
| ------------------- | ------ | ----------------------------------------------------------------------- |
| **Area similarity** | 70%    | Primary metric - total visible size (width × height) relative to parent |
| **Aspect ratio**    | 20%    | Shape consistency - prevents matching tall elements to wide ones        |
| **Position**        | 10%    | Spatial relationship - center point (cx, cy) relative to parent         |

**Why these weights:**

- **Area (70%)**: Visual size is the most reliable indicator for matching implementation to design
- **Aspect (20%)**: Shape matters more than exact position in responsive layouts
- **Position (10%)**: Helps disambiguate siblings with similar size/shape, but intentionally low to tolerate flex/grid reordering

All metrics are normalized relative to parent dimensions for scale-independent matching.

## Figma CSS Mapping

Figma design properties are mapped to CSS as follows:

- **TEXT nodes**: `fill` → `color` (text color)
- **Other nodes**: `fill` → `background-color`, `stroke` → `border-color`

This ensures accurate color comparison for text elements vs. containers.

## Path Alias ("#") Compatibility

This project uses Node.js `"imports"` field for path aliasing (e.g., `#plugin/*`, `#core/*`):

```json
{
  "imports": {
    "#plugin/*": "./dist/*"
  }
}
```

**Node.js support:**

- Node.js >=12.20.0 (built-in support for `"imports"` field)
- Bun (full support)

**Bundler configuration (Webpack/Vite):**

If your bundler doesn't resolve `"imports"` field automatically, configure path aliases:

**Webpack:**

```js
// webpack.config.js
module.exports = {
  resolve: {
    alias: {
      '#plugin': path.resolve(__dirname, 'packages/uimatch-plugin/dist'),
      '#core': path.resolve(__dirname, 'packages/uimatch-core/src'),
    },
  },
};
```

**Vite:**

```js
// vite.config.js
export default {
  resolve: {
    alias: {
      '#plugin': '/packages/uimatch-plugin/dist',
      '#core': '/packages/uimatch-core/src',
    },
  },
};
```

**TypeScript (tsconfig.json):**

```json
{
  "compilerOptions": {
    "paths": {
      "#plugin/*": ["./packages/uimatch-plugin/dist/*"],
      "#core/*": ["./packages/uimatch-core/src/*"]
    }
  }
}
```

## Recommended Thresholds for Pad+Intersection Mode

When using `size=pad` with `contentBasis=intersection` (default), the default thresholds may be too strict during development:

**Development preset** (for active iteration):

```bash
bun run uimatch:settings -- set \
  comparison.acceptancePixelDiffRatio=0.08 \
  comparison.acceptanceColorDeltaE=5
```

**Production preset** (for final validation):

```bash
bun run uimatch:settings -- set \
  comparison.acceptancePixelDiffRatio=0.01 \
  comparison.acceptanceColorDeltaE=3
```

The pad+intersection mode calculates `pixelDiffRatioContent` based on the intersection of content areas. A typical layout mismatch may result in 3-8% content-based pixel differences during iterative development.
