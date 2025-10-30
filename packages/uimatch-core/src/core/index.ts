export {
  compareImages,
  type CompareImageInput,
  type CompareImageResult,
  type PixelmatchOptions,
} from './compare';
export { buildStyleDiffs, type DiffOptions } from './diff';
export {
  calculateAreaGap,
  calculateCQI,
  detectSuspicions,
  evaluateQualityGate,
  shouldReEvaluate,
  type CQIParams,
  type HardGateViolation,
  type QualityGateResult,
  type QualityGateThresholds,
  type SuspicionDetection,
} from './quality-gate';
