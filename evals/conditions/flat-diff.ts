import type { ComparisonSnapshot, ConditionFeedback } from '../types.js';
import { buildScalarFeedback } from './scalar.js';

export function buildFlatDiffFeedback(
  comparison: ComparisonSnapshot,
  rootSelector: string
): ConditionFeedback {
  const feedback = buildScalarFeedback(comparison);
  const styleDiffs = comparison.styleDiffs.map((styleDiff) =>
    styleDiff.isRoot === true ? { ...styleDiff, selector: rootSelector } : styleDiff
  );
  return {
    ...feedback,
    text: `${feedback.text}\nuiMatch styleDiffs:\n${JSON.stringify(styleDiffs, null, 2)}`,
  };
}
