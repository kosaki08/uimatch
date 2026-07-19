import type {
  AppConfig as CoreAppConfig,
  ExpectedSpec as CoreExpectedSpec,
  QualityGateResult as CoreQualityGateResult,
  StyleDiff as CoreStyleDiff,
  TokenMap as CoreTokenMap,
} from '@uimatch/core';
import { expectTypeOf, test } from 'vitest';
import type { AppConfig, ExpectedSpec, QualityGateResult, StyleDiff, TokenMap } from './index.js';

test('public CLI DTOs remain structurally aligned with the bundled engine', () => {
  expectTypeOf<AppConfig>().toEqualTypeOf<CoreAppConfig>();
  expectTypeOf<ExpectedSpec>().toEqualTypeOf<CoreExpectedSpec>();
  expectTypeOf<QualityGateResult>().toEqualTypeOf<CoreQualityGateResult>();
  expectTypeOf<StyleDiff>().toEqualTypeOf<CoreStyleDiff>();
  expectTypeOf<TokenMap>().toEqualTypeOf<CoreTokenMap>();
});
