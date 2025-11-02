/**
 * Style difference calculation with staged checking support
 */

export { buildStyleDiffs, type DiffOptions } from './builder';
export {
  expandShorthand,
  getDominantScope,
  getPropertyScope,
  shouldIncludeDiffAtStage,
} from './scope';
export { calculatePriorityScore, generatePatchHints } from './scoring';
export { isNoiseElement, toKebabCase } from './utils';
