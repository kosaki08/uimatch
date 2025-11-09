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
  size=strict
```

## Expected Behavior

- **Size**: Must match exactly (Figma width/height = story width/height)
- **Alignment**: Pixel-by-pixel comparison
- **Quality Gate**: Strict thresholds (pixelDiffRatioContent < 0.01)

## Troubleshooting

| Issue                    | Solution                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| Size mismatch rejected   | Check DPR scaling (`dpr=1` or `dpr=2`)                               |
| Text rendering different | Set `acceptanceColorDeltaE=5.0` in config for antialiasing tolerance |
| Minor pixel differences  | Adjust `acceptancePixelDiffRatio=0.02` in config (2% threshold)      |
| Browser zoom affecting   | Set explicit viewport width in Playwright/Storybook                  |

## Config

Configure quality thresholds in `.uimatchrc.json`:

```json
{
  "comparison": {
    "acceptancePixelDiffRatio": 0.01,
    "acceptanceColorDeltaE": 3.0,
    "pixelmatchThreshold": 0.1
  }
}
```

**Note:** Size strategy (`size=strict`) is a CLI flag, not a config file option.
