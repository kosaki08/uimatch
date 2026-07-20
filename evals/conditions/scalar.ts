import type { ComparisonSnapshot, ConditionFeedback } from '../types.js';
import { buildRenderOnlyFeedback } from './render-only.js';

export function buildScalarFeedback(comparison: ComparisonSnapshot): ConditionFeedback {
  const feedback = buildRenderOnlyFeedback(comparison);
  return {
    ...feedback,
    text: `${feedback.text}\nuiMatch DFS score: ${comparison.visible.dfs.toFixed(2)}`,
  };
}
