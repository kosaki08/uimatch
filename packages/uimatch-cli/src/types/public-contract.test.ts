import type {
  AppConfig as CoreAppConfig,
  ExpectedSpec as CoreExpectedSpec,
  QualityGateResult as CoreQualityGateResult,
  StyleDiff as CoreStyleDiff,
  TokenMap as CoreTokenMap,
  UiMatchErrorCategory as CoreUiMatchErrorCategory,
  UiMatchErrorCode as CoreUiMatchErrorCode,
} from '@uimatch/core';
import { expectTypeOf, test } from 'vitest';
import type {
  AppConfig,
  ExpectedSpec,
  FigmaRootDimensionConstraint,
  QualityGateResult,
  StyleDiff,
  TokenMap,
  UiMatchErrorCategory,
  UiMatchErrorCode,
} from './index.js';

test('public CLI DTOs remain structurally aligned with the bundled engine', () => {
  expectTypeOf<AppConfig>().toEqualTypeOf<CoreAppConfig>();
  expectTypeOf<ExpectedSpec>().toEqualTypeOf<CoreExpectedSpec>();
  expectTypeOf<FigmaRootDimensionConstraint['axis']>().toEqualTypeOf<'horizontal' | 'vertical'>();
  expectTypeOf<QualityGateResult>().toEqualTypeOf<CoreQualityGateResult>();
  expectTypeOf<StyleDiff>().toEqualTypeOf<CoreStyleDiff>();
  expectTypeOf<TokenMap>().toEqualTypeOf<CoreTokenMap>();
  // Locally-declared error contract must track the engine's.
  expectTypeOf<UiMatchErrorCode>().toEqualTypeOf<CoreUiMatchErrorCode>();
  expectTypeOf<UiMatchErrorCategory>().toEqualTypeOf<CoreUiMatchErrorCategory>();
});
