import type { ComparisonSnapshot, ConditionFeedback } from '../types.js';

export function buildRenderOnlyFeedback(comparison: ComparisonSnapshot): ConditionFeedback {
  return {
    images: [
      {
        dataUrl: `data:image/png;base64,${comparison.artifacts.figmaPngB64}`,
        label: 'Reference rendering',
      },
      {
        dataUrl: `data:image/png;base64,${comparison.artifacts.implPngB64}`,
        label: 'Mutated implementation rendering',
      },
      {
        dataUrl: `data:image/png;base64,${comparison.artifacts.diffPngB64}`,
        label: 'Pixel difference rendering',
      },
    ],
    text: 'Use only the supplied renderings as comparison feedback.',
  };
}
