import type { ComparisonSnapshot, ConditionFeedback, RootDimensionConstraint } from '../types.js';
import {
  buildTypedDiffEvidence,
  composeTypedFeedback,
  typedEvidenceGuidance,
} from './typed-diff.js';

// The attention control between typed-diff and typed-contract: same typed evidence, plus a generic
// robustness reminder, but no mode-specific obligation. It tells the agent to care about unseen
// content without telling it what HUG, FILL, or FIXED each require, so a lift over typed-diff would
// come from the reminder alone and a further lift in typed-contract from the mode-specific meaning.
const genericRobustnessReminder =
  'The repair must stay robust when the content or the parent size changes, not only reproduce the current rendering. Do not optimize for the currently observed values alone.';

export function buildTypedReminderFeedback(
  comparison: ComparisonSnapshot,
  rootSelector: string,
  sourceCss: string,
  dimensionConstraints: readonly RootDimensionConstraint[]
): ConditionFeedback {
  const evidence = buildTypedDiffEvidence(
    comparison,
    rootSelector,
    sourceCss,
    dimensionConstraints
  );
  return composeTypedFeedback(
    comparison,
    evidence,
    `${typedEvidenceGuidance} ${genericRobustnessReminder}`
  );
}
