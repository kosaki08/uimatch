export { PlaywrightAdapter, browserPool, captureTarget, resolveLocator } from './adapters/index';
export {
  DEFAULT_CONFIG,
  QUALITY_GATE_PROFILES,
  getQualityGateProfile,
  listQualityGateProfiles,
  loadConfig,
  mergeConfig,
} from './config/index';
export type {
  AppConfig,
  CaptureConfig,
  ComparisonConfig,
  QualityGateProfile,
} from './config/index';
export { compareImages } from './core/compare';
export type { CompareImageInput, CompareImageResult, PixelmatchOptions } from './core/compare';
export { buildStyleDiffs } from './core/diff';
export type { DiffOptions } from './core/diff';
export {
  calculateAreaGap,
  calculateCQI,
  detectSuspicions,
  evaluateQualityGate,
  shouldReEvaluate,
} from './core/quality-gate';
export type {
  CQIParams,
  HardGateViolation,
  QualityGateResult,
  QualityGateThresholds,
  SuspicionDetection,
} from './core/quality-gate';
export {
  createCaptureError,
  createComparisonError,
  createConfigError,
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
  unwrapOr,
} from './types/index';
export type {
  AppError,
  BaseError,
  BrowserAdapter,
  CaptureError,
  CaptureOptions,
  CaptureResult,
  ComparisonError,
  ConfigError,
  ExpectedSpec,
  Failure,
  PatchHint,
  Result,
  StyleDiff,
  Success,
  TokenMap,
} from './types/index';
export { deltaE2000, rgbToLab } from './utils/color';
export type { Lab } from './utils/color';
export { normLineHeight, parseBoxShadow, parseCssColorToRgb, toPx } from './utils/normalize';
export type { BoxShadowParsed, RGB } from './utils/normalize';
