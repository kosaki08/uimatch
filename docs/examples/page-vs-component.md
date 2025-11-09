# Page vs Component (Noise Reduction)

Compare when Figma and story have different contexts (padding, backgrounds, surrounding elements).

## Use Case

- Full page Figma frame vs isolated component
- Component with different padding/margins
- Design system showcase vs actual implementation
- Reduce false positives from context differences

## Example

```bash
npx uimatch compare \
  figma=AbCdEf:1-23 \
  story=http://localhost:6006/?path=/story/form--contact \
  selector="#root form" \
  size=pad \
  contentBasis=intersection
```

## Key Options

| Option         | Value          | Effect                                |
| -------------- | -------------- | ------------------------------------- |
| `size`         | `pad`          | Add padding to smaller image          |
| `contentBasis` | `intersection` | Compare only overlapping content area |

## Why This Works

- **pad**: Adds white padding instead of rejecting size mismatch
- **intersection**: Ignores padding/margin differences
- **contentBasis**: Focuses on actual content pixels, not empty space

## Troubleshooting

| Issue                         | Solution                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Too much area ignored         | Try `contentBasis=union` to compare full extent                                   |
| Padding color mismatches      | Normal - intersection mode excludes padding                                       |
| Still too many false positive | Increase `acceptancePixelDiffRatio=0.03` in `.uimatchrc.json` or check for shifts |
| Content area detection wrong  | Verify `contentBasis` logic (union=all, intersection=overlap)                     |

## Config

Configure quality thresholds in `.uimatchrc.json`:

```json
{
  "comparison": {
    "acceptancePixelDiffRatio": 0.01,
    "acceptanceColorDeltaE": 3.0
  }
}
```

**Note:** Size handling (`size=pad`) and content basis (`contentBasis=intersection`) are CLI flags, not config file options.
