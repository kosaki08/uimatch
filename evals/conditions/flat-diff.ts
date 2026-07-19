import type { ComparisonSnapshot, ConditionFeedback } from '../types.js';
import { buildScalarFeedback } from './scalar.js';

export function buildFlatDiffFeedback(comparison: ComparisonSnapshot): ConditionFeedback {
  const feedback = buildScalarFeedback(comparison);
  return {
    ...feedback,
    text: `${feedback.text}\nuiMatch styleDiffs:\n${JSON.stringify(comparison.styleDiffs, null, 2)}`,
  };
}
