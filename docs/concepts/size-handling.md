# Size Handling Strategies

Control how uiMatch handles size mismatches between Figma and implementation.

## Overview

When Figma dimensions ≠ story dimensions, uiMatch can **adapt** instead of rejecting. Choose strategy based on use case.

## Strategies

### strict

**Behavior**: Reject if sizes don't match exactly.

**Use Case**: Pixel-perfect component comparison.

**Example**:

```bash
npx uimatch compare figma=... story=... selector=... size=strict
```

**Result**: Fail fast if `figmaWidth !== storyWidth` or `figmaHeight !== storyHeight`.

---

### pad

**Behavior**: Add white padding to smaller image to match larger one.

**Use Case**: Page vs component, different contexts.

**Example**:

```bash
npx uimatch compare figma=... story=... selector=... \
  size=pad contentBasis=intersection
```

**Result**:

- Figma 300x200, Story 400x200 → Add 100px white padding to Figma
- Content area calculated based on `contentBasis`

---

### crop

**Behavior**: Crop larger image to match smaller one.

**Use Case**: Focus on specific region, ignore overflow.

**Example**:

```bash
npx uimatch compare figma=... story=... selector=... size=crop
```

**Result**: Figma 300x200, Story 400x200 → Crop Story to 300x200.

**Warning**: May lose important content at edges.

---

### scale

**Behavior**: Scale smaller image to match larger one.

**Use Case**: Responsive design, DPR differences.

**Example**:

```bash
npx uimatch compare figma=... story=... selector=... size=scale
```

**Result**: Figma 300x200, Story 600x400 → Scale Figma 2x (may blur).

**Note**: Scaling introduces interpolation artifacts.

## contentBasis

Defines how content area is calculated (used with `pad`/`crop` for Quality Gate V2).

| Value          | Behavior                          | Use Case                   |
| -------------- | --------------------------------- | -------------------------- |
| `union`        | Full extent of both images        | No area should be ignored  |
| `intersection` | Only overlapping region           | Ignore padding differences |
| `figma`        | Use Figma dimensions as reference | Trust design dimensions    |
| `story`        | Use story dimensions as reference | Trust implementation       |

## Decision Matrix

| Scenario                    | Recommended Strategy                 | contentBasis   |
| --------------------------- | ------------------------------------ | -------------- |
| Exact-size component        | `size=strict`                        | N/A            |
| Page vs component           | `size=pad contentBasis=intersection` | `intersection` |
| Focus on design region      | `size=crop`                          | `figma`        |
| Responsive/multi-DPR        | `size=scale`                         | `union`        |
| Strict full-area comparison | `size=pad contentBasis=union`        | `union`        |

## Configuration

```json
{
  "comparison": {
    "sizeHandling": "pad",
    "contentBasis": "intersection",
    "qualityGateMode": "v2"
  }
}
```

## Visual Examples

```
Figma: 200x100  Story: 300x100

strict:       ❌ Reject (size mismatch)
pad:          ✅ Add 100px padding to Figma → compare 300x100
crop:         ✅ Crop Story to 200x100 → compare 200x100
scale:        ✅ Scale Figma 1.5x → compare 300x150 (height mismatch)

With contentBasis=intersection:
- Compare only 200x100 overlapping region
- Ignore 100px padding area
```

## Troubleshooting

| Issue                    | Solution                                           |
| ------------------------ | -------------------------------------------------- |
| Size rejection in strict | Switch to `pad` or `crop`                          |
| Too much area ignored    | Use `contentBasis=union` instead of `intersection` |
| Blurry comparison        | Avoid `scale`, use `pad` or fix source DPR         |
| Padding color mismatches | Normal with `intersection` - focus on content      |

## See Also

- [Quality Gate V2](./quality-gate-v2.md) - Content-aware metrics
- [Examples: Page vs Component](../examples/page-vs-component.md) - pad + intersection pattern
