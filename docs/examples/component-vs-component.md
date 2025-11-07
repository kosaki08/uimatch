# Component vs Component (Strict Comparison)

Pixel-perfect comparison when both Figma and implementation have exact same dimensions.

## Use Case

- Button components with fixed dimensions
- Icon components
- Badge/chip components
- Any component where size should match exactly

## Example

```bash
npx uimatch compare \
  figma=AbCdEf:1-23 \
  story=http://localhost:6006/?path=/story/button--primary \
  selector="#root button" \
  size=strict \
  qualityGateMode=v2
```

## Expected Behavior

- **Size**: Must match exactly (Figma width/height = story width/height)
- **Alignment**: Pixel-by-pixel comparison
- **Quality Gate**: Strict thresholds (pixelDiffRatioV2 < 0.01)

## Troubleshooting

| Issue                    | Solution                                            |
| ------------------------ | --------------------------------------------------- |
| Size mismatch rejected   | Check DPR scaling (`dpr=1` or `dpr=2`)              |
| Text rendering different | Use `acceptanceColorDeltaE=5.0` for antialiasing    |
| Minor pixel differences  | Adjust `pixelDiffRatioV2=0.02` (2% threshold)       |
| Browser zoom affecting   | Set explicit viewport width in Playwright/Storybook |

## Config

```json
{
  "comparison": {
    "sizeHandling": "strict",
    "qualityGateMode": "v2",
    "pixelDiffRatioV2": 0.01,
    "acceptanceColorDeltaE": 3.0
  }
}
```
