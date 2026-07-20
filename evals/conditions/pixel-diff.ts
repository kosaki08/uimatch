import type { ComparisonSnapshot, ConditionFeedback } from '../types.js';

export function buildPixelDiffFeedback(comparison: ComparisonSnapshot): ConditionFeedback {
  return {
    images: [
      {
        dataUrl: `data:image/png;base64,${comparison.artifacts.figmaPngB64}`,
        label: 'Reference rendering',
      },
      {
        dataUrl: `data:image/png;base64,${comparison.artifacts.implPngB64}`,
        label: 'Current implementation rendering',
      },
      {
        dataUrl: `data:image/png;base64,${comparison.artifacts.diffPngB64}`,
        label: 'Pixel difference rendering',
      },
    ],
    text: 'Use the supplied screenshots and pixel difference image as comparison feedback.',
  };
}
