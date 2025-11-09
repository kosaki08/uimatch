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

## Quality Gate Improvements

Quality Gate V2 improves comparison accuracy through:

| Aspect            | Improvement                              | Benefit                              |
| ----------------- | ---------------------------------------- | ------------------------------------ |
| Pixel diff basis  | Content area instead of total area       | Reduces false positives from padding |
| Size handling     | Flexible strategies via `size` CLI flag  | Supports varied layout contexts      |
| Content awareness | Automatic content area detection         | Focus on actual visible content      |
| Threshold control | Configurable via `.uimatchrc.json`       | Adaptable to project requirements    |
| Use cases         | Optimized for mixed-size/varied contexts | Real-world scenario support          |

## Configuration

Quality Gate V2 is the default and only implementation. Configure thresholds in `.uimatchrc.json`:

```json
{
  "comparison": {
    "acceptancePixelDiffRatio": 0.01,
    "acceptanceColorDeltaE": 3.0,
    "pixelmatchThreshold": 0.1
  }
}
```

**Available options:**

- `acceptancePixelDiffRatio`: Maximum acceptable pixel difference ratio (default: 0.01 / 1%)
- `acceptanceColorDeltaE`: Maximum acceptable color difference (default: 3.0)
- `pixelmatchThreshold`: Pixelmatch sensitivity, smaller = more sensitive (default: 0.1)

## When to Use

Quality Gate V2 is designed for real-world scenarios:

- Page vs component comparisons
- Different padding/margins expected
- Content-focused validation
- CI/CD with varied contexts
- Mixed-size scenarios with flexible layouts

The content-aware pixel difference calculation reduces false positives from padding/margin differences while maintaining strict quality standards for actual content.

## Troubleshooting

| Issue                    | Solution                                                      |
| ------------------------ | ------------------------------------------------------------- |
| Too many false positives | Increase `acceptancePixelDiffRatio=0.02` in comparison config |
| Color differences fail   | Increase `acceptanceColorDeltaE=5.0` in comparison config     |
| Area gap failures        | Check layout shifts, use `size=pad` CLI flag                  |

## See Also

- [Size Handling](./size-handling.md) - Size strategies (strict/pad/crop/scale)
- [Examples: Page vs Component](../examples/page-vs-component.md) - Using V2 with contentBasis
