/**
 * Default configuration values
 */

import type { AppConfig } from './schema';

/**
 * Default application configuration.
 * These values are used when no configuration is provided.
 */
export const DEFAULT_CONFIG: AppConfig = {
  capture: {
    defaultViewportWidth: 1440,
    defaultViewportHeight: 900,
    defaultDpr: 2,
    defaultMaxChildren: 200,
    defaultMaxDepth: 6,
    defaultIdleWaitMs: 150,
    basicAuthUser: undefined,
    basicAuthPass: undefined,
  },
  comparison: {
    pixelmatchThreshold: 0.1,
    includeAA: false,
    colorDeltaEThreshold: 3.0,
    acceptancePixelDiffRatio: 0.01,
    acceptanceColorDeltaE: 5.0,
    toleranceSpacing: 0.15,
    toleranceDimension: 0.05,
    toleranceLayoutGap: 0.1,
    toleranceRadius: 0.12,
    toleranceBorderWidth: 0.3,
    toleranceShadowBlur: 0.15,
    toleranceShadowColorExtraDE: 1.0,
  },
};
