import type { ComparisonSnapshot, ConditionFeedback } from '../types.js';
import { buildPixelDiffFeedback } from './pixel-diff.js';

export function buildScalarFeedback(comparison: ComparisonSnapshot): ConditionFeedback {
  const feedback = buildPixelDiffFeedback(comparison);
  return {
    ...feedback,
    text: `${feedback.text}\nuiMatch DFS score: ${comparison.visible.dfs.toFixed(2)}`,
  };
}
