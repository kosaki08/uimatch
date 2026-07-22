import { UiMatchError as UiMatchErrorImpl } from '@uimatch/core';
import type { UiMatchErrorCode, UiMatchError as UiMatchErrorShape } from './types/index.js';

/**
 * Re-export the engine's error class under a locally-declared type. The class is
 * bundled, so `instanceof` still holds, and the published types do not name the
 * private `@uimatch/core` package.
 */
export const UiMatchError: new (
  code: UiMatchErrorCode,
  message: string,
  options?: ErrorOptions
) => UiMatchErrorShape = UiMatchErrorImpl;
export type UiMatchError = UiMatchErrorShape;
export {
  closeUiMatchBrowsers,
  getSettings,
  resetSettings,
  uiMatchCompare,
} from './commands/index.js';
export { loadFigmaMcpConfig, loadSkillConfig } from './config/index.js';
export type { FigmaMcpConfig, SkillConfig } from './config/index.js';
export type {
  AppConfig,
  CompareArgs,
  CompareResult,
  FigmaRef,
  FigmaRootDimensionConstraint,
  FigmaVariable,
  Thresholds,
  UiMatchErrorCategory,
  UiMatchErrorCode,
} from './types/index.js';

/**
 * Experimental APIs namespace.
 * @experimental All exports in this namespace may change or be removed without notice.
 */
export * as experimental from './experimental/index.js';
