/**
 * Style difference calculation with staged checking support
 */

export {
  DEFAULT_DIFF_THRESHOLDS,
  buildStyleDiffs,
  type DiffOptions,
  type DiffThresholds,
} from './builder';
export {
  expandShorthand,
  getDominantScope,
  getPropertyScope,
  shouldIncludeDiffAtStage,
} from './scope';
export { calculatePriorityScore, generatePatchHints } from './scoring';
export { isNoiseElement, toKebabCase } from './utils';
