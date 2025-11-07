# Quality Gate V2

Content-aware quality metrics with adaptive thresholds.

## Overview

Quality Gate V2 improves upon V1 by focusing on **content pixels** instead of total image area, reducing false positives from padding/margin differences.

## Key Metrics

### 1. pixelDiffRatioContent

**What**: Percentage of differing pixels within content area (excludes padding).

**Formula**: `diffPixels / contentAreaPixels`

**Threshold**: `< 0.01` (1% recommended)

**Why Better Than V1**: V1 used total area, penalizing padding differences. V2 focuses on actual content.

```bash
# Example: 100 diff pixels in 10,000 content pixels = 1%
pixelDiffRatioContent = 100 / 10000 = 0.01 ✅ PASS
```

### 2. Area Gap

**What**: Size difference between Figma and story content areas.

**Formula**: `abs(figmaArea - storyArea) / figmaArea`

**Threshold**: `< 0.05` (5% recommended)

**Use**: Detect layout shifts, missing elements, truncation.

### 3. CQI (Comparison Quality Index)

**What**: Weighted composite score (0-100).

**Components**:

- Visual similarity (60%)
- Style accuracy (30%)
- Dimensional accuracy (10%)

**Threshold**: `> 85` (recommended)

## V1 vs V2

| Metric            | V1                   | V2                      | Impact                  |
| ----------------- | -------------------- | ----------------------- | ----------------------- |
| Pixel diff basis  | Total area           | Content area            | Less padding noise      |
| Size mismatch     | Strict rejection     | Configurable (size=pad) | More flexible           |
| Content awareness | None                 | contentBasis option     | Intersection/union mode |
| Recommended for   | Exact-size scenarios | Mixed-size scenarios    | Real-world use cases    |

## Configuration

```json
{
  "comparison": {
    "qualityGateMode": "v2",
    "pixelDiffRatioV2": 0.01,
    "areaGapThreshold": 0.05,
    "cqiThreshold": 85,
    "contentBasis": "intersection"
  }
}
```

## When to Use

**Use V2**:

- Page vs component comparisons
- Different padding/margins expected
- Content-focused validation
- CI/CD with varied contexts

**Use V1**:

- Pixel-perfect strict mode
- Fixed-size components only
- Legacy workflows

## Troubleshooting

| Issue                        | Solution                                               |
| ---------------------------- | ------------------------------------------------------ |
| Too many false positives     | Increase `pixelDiffRatioV2=0.02`                       |
| Area gap failures            | Check layout shifts, use `size=pad`                    |
| CQI too strict               | Lower `cqiThreshold=80`                                |
| Content area detection wrong | Verify `contentBasis` (intersection/union/figma/story) |

## See Also

- [Size Handling](./size-handling.md) - Size strategies (strict/pad/crop/scale)
- [Examples: Page vs Component](../examples/page-vs-component.md) - Using V2 with contentBasis
