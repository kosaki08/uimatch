export { PlaywrightAdapter, captureTarget } from './adapters/index.ts';
export { compareImages } from './core/compare.ts';
export type { CompareImageInput, CompareImageResult, PixelmatchOptions } from './core/compare.ts';
export { buildStyleDiffs } from './core/diff.ts';
export type { DiffOptions } from './core/diff.ts';
export type {
  BrowserAdapter,
  CaptureOptions,
  CaptureResult,
  ExpectedSpec,
  PatchHint,
  StyleDiff,
  TokenMap,
} from './types/index.ts';
export { deltaE2000, rgbToLab } from './utils/color.ts';
export type { Lab } from './utils/color.ts';
export { normLineHeight, parseBoxShadow, parseCssColorToRgb, toPx } from './utils/normalize.ts';
export type { BoxShadowParsed, RGB } from './utils/normalize.ts';
