export {
  PlaywrightAdapter,
  browserPool,
  captureTarget,
  getChromiumLaunchPolicy,
  launchChromium,
  resolveLocator,
} from './adapters/index';
export {
  DEFAULT_CONFIG,
  QUALITY_GATE_PROFILES,
  getQualityGateProfile,
  listQualityGateProfiles,
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
export { DEFAULT_DIFF_THRESHOLDS, buildStyleDiffs } from './core/diff';
export type { DiffOptions, DiffThresholds } from './core/diff';
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
export { UiMatchError, err, isErr, isOk, map, mapErr, ok, unwrap, unwrapOr } from './types/index';
export type {
  BrowserAdapter,
  CaptureOptions,
  CaptureResult,
  ExpectedSpec,
  Failure,
  PatchHint,
  Result,
  StyleDiff,
  Success,
  TokenMap,
  UiMatchErrorCategory,
  UiMatchErrorCode,
} from './types/index';
export { deltaE2000, rgbToLab } from './utils/color';
export type { Lab } from './utils/color';
export {
  normLineHeight,
  normalizeTextEx,
  parseBoxShadow,
  parseCssColorToRgb,
  textSimilarity,
  toPx,
} from './utils/normalize';
export type { BoxShadowParsed, RGB, TextNormalizeOptions } from './utils/normalize';
export { compareText } from './utils/text-diff';
export type { TextCompareOptions, TextDiff, TextDiffKind } from './utils/text-diff';
