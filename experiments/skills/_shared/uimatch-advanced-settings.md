# uiMatch Advanced Settings (viewport, dpr, size, contentBasis)

This document describes advanced tuning options for uiMatch.
Claude Code should read this only when it needs to fine-tune comparisons.

## 1. Viewport

Use `viewport` when layout depends on screen size:

```bash
viewport=1280x720
viewport=375x667
```

Match the viewport that the Figma design assumes. Keep it explicit in CI.

## 2. Device pixel ratio (dpr)

Control devicePixelRatio for the browser:

```bash
dpr=1   # good default
dpr=2   # retina-like environments
```

Keep `dpr` fixed in CI for stability.

## 3. Size modes

```bash
size=strict   # exact size match (default)
size=pad      # pad smaller image with letterboxing
size=crop     # compare overlapping region only
size=scale    # scale implementation to Figma size
```

Typical patterns:

- Component vs component → `size=strict`
- Page vs component / extra padding → `size=pad`
- Only overlapping region matters → `size=crop`

## 4. Content basis

```bash
contentBasis=union         # union of both content areas (default)
contentBasis=intersection  # intersection only (good with size=pad)
contentBasis=figma         # Figma area only
contentBasis=impl          # implementation area only
```

Recommended:

- Component vs component → `contentBasis=union`
- Page vs component → `size=pad contentBasis=intersection`
- Figma is the “truth” → `contentBasis=figma`

## 5. Quality gate profiles (reminder)

Use these profiles instead of hand-tuning thresholds:

- `component/strict` – pixel-perfect (design system components)
- `component/dev` – development-tolerant (recommended default)
- `page-vs-component` – page vs component with padding
- `lenient` – prototypes / early drafts

For full threshold definitions see:

- `docs/docs/ci-integration.md`
- `packages/uimatch-core/src/config/quality-gate-profiles.ts`
