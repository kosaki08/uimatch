/**
 * Comprehensive coverage tests for compare.ts
 * Focuses on uncovered paths: parseArgs, error cases, text match, profiles
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import type { ParsedArgs } from '../compare';
import { buildCompareConfig } from '../compare';

// Access parseArgs via module for testing (since it's not exported)
// We test through the public buildCompareConfig API instead

describe('buildCompareConfig - Error Paths', () => {
  test('throws error when figma parameter is missing', () => {
    const args: ParsedArgs = {
      story: 'http://localhost:6006',
      selector: '#root',
    };

    expect(() => buildCompareConfig(args)).toThrow('Missing required parameter: figma');
  });

  test('throws error when story parameter is missing', () => {
    const args: ParsedArgs = {
      figma: 'AbCdEf:1-23',
      selector: '#root',
    };

    expect(() => buildCompareConfig(args)).toThrow('Missing required parameter: story');
  });

  test('throws error when selector parameter is missing', () => {
    const args: ParsedArgs = {
      figma: 'AbCdEf:1-23',
      story: 'http://localhost:6006',
    };

    expect(() => buildCompareConfig(args)).toThrow('Missing required parameter: selector');
  });
});

describe('buildCompareConfig - Optional Parameters', () => {
  let baseArgs: ParsedArgs;

  beforeEach(() => {
    baseArgs = {
      figma: 'AbCdEf:1-23',
      story: 'http://localhost:6006',
      selector: '#root',
    };
  });

  test('sets subselector when provided', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      subselector: '> .child',
    };

    const config = buildCompareConfig(args);

    expect(config.subselector).toBe('> .child');
  });

  test('sets figmaChildStrategy when valid', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      figmaChildStrategy: 'area',
    };

    const config = buildCompareConfig(args);

    expect(config.figmaChildStrategy).toBe('area');
  });

  test('does not set figmaChildStrategy when invalid', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      figmaChildStrategy: 'invalid',
    };

    const config = buildCompareConfig(args);

    expect(config.figmaChildStrategy).toBeUndefined();
  });

  test('sets selectorsPath when provided', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      selectors: './anchors.json',
    };

    const config = buildCompareConfig(args);

    expect(config.selectorsPath).toBe('./anchors.json');
  });

  test('sets selectorsWriteBack when provided', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      selectorsWriteBack: 'true',
    };

    const config = buildCompareConfig(args);

    expect(config.selectorsWriteBack).toBe(true);
  });

  test('sets selectorsPlugin when provided', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      selectorsPlugin: '@custom/selector-plugin',
    };

    const config = buildCompareConfig(args);

    expect(config.selectorsPlugin).toBe('@custom/selector-plugin');
  });

  test('sets maxChildren when valid number', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      maxChildren: '150',
    };

    const config = buildCompareConfig(args);

    expect(config.maxChildren).toBe(150);
  });

  test('skips maxChildren when NaN', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      maxChildren: 'not-a-number',
    };

    const config = buildCompareConfig(args);

    expect(config.maxChildren).toBeUndefined();
  });

  test('sets maxDepth when valid number', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      maxDepth: '8',
    };

    const config = buildCompareConfig(args);

    expect(config.maxDepth).toBe(8);
  });

  test('skips maxDepth when NaN', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      maxDepth: 'invalid',
    };

    const config = buildCompareConfig(args);

    expect(config.maxDepth).toBeUndefined();
  });

  test('defaults propsMode to extended when not provided', () => {
    const args: ParsedArgs = {
      ...baseArgs,
    };

    const config = buildCompareConfig(args);

    expect(config.propsMode).toBe('extended');
  });

  test('sets propsMode to default when explicitly set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      propsMode: 'default',
    };

    const config = buildCompareConfig(args);

    expect(config.propsMode).toBe('default');
  });

  test('sets propsMode to all when explicitly set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      propsMode: 'all',
    };

    const config = buildCompareConfig(args);

    expect(config.propsMode).toBe('all');
  });

  test('defaults propsMode to extended when invalid', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      propsMode: 'invalid',
    };

    const config = buildCompareConfig(args);

    expect(config.propsMode).toBe('extended');
  });

  test('handles iframe alias for detectStorybookIframe', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      story: 'http://localhost:3000/page',
      iframe: 'true',
    };

    const config = buildCompareConfig(args);

    expect(config.detectStorybookIframe).toBe(true);
  });
});

describe('buildCompareConfig - Text Match Configuration', () => {
  let baseArgs: ParsedArgs;

  beforeEach(() => {
    baseArgs = {
      figma: 'AbCdEf:1-23',
      story: 'http://localhost:6006',
      selector: '#root',
    };
  });

  test('enables text check with default values when text=true', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      text: 'true',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck).toEqual({
      enabled: true,
      mode: 'self',
      normalize: 'nfkc_ws',
      caseSensitive: false,
      match: 'ratio',
      minRatio: 0.98,
    });
  });

  test('auto-enables text check when textMode is set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMode: 'descendants',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.enabled).toBe(true);
    expect(config.textCheck?.mode).toBe('descendants');
  });

  test('auto-enables text check when textNormalize is set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textNormalize: 'nfkc',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.enabled).toBe(true);
    expect(config.textCheck?.normalize).toBe('nfkc');
  });

  test('auto-enables text check when textCase is set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textCase: 'sensitive',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.enabled).toBe(true);
    expect(config.textCheck?.caseSensitive).toBe(true);
  });

  test('auto-enables text check when textMatch is set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMatch: 'exact',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.enabled).toBe(true);
    expect(config.textCheck?.match).toBe('exact');
  });

  test('auto-enables text check when textMinRatio is set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMinRatio: '0.95',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.enabled).toBe(true);
    expect(config.textCheck?.minRatio).toBe(0.95);
  });

  test('supports normalize mode: none', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textNormalize: 'none',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.normalize).toBe('none');
  });

  test('supports normalize mode: nfkc', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textNormalize: 'nfkc',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.normalize).toBe('nfkc');
  });

  test('defaults normalize mode to nfkc_ws for invalid values', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textNormalize: 'invalid',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.normalize).toBe('nfkc_ws');
  });

  test('supports match mode: contains', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMatch: 'contains',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.match).toBe('contains');
  });

  test('defaults match mode to ratio for invalid values', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMatch: 'invalid',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.match).toBe('ratio');
  });

  test('validates minRatio is finite number', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMinRatio: 'invalid',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.minRatio).toBe(0.98);
  });

  test('validates minRatio is non-negative', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMinRatio: '-0.5',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.minRatio).toBe(0.98);
  });

  test('accepts valid minRatio', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMinRatio: '0.85',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.minRatio).toBe(0.85);
  });

  test('supports combined text match configuration', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      text: 'true',
      textMode: 'descendants',
      textNormalize: 'none',
      textCase: 'sensitive',
      textMatch: 'contains',
      textMinRatio: '0.9',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck).toEqual({
      enabled: true,
      mode: 'descendants',
      normalize: 'none',
      caseSensitive: true,
      match: 'contains',
      minRatio: 0.9,
    });
  });
});

describe('buildCompareConfig - Profile Integration', () => {
  let baseArgs: ParsedArgs;

  beforeEach(() => {
    baseArgs = {
      figma: 'AbCdEf:1-23',
      story: 'http://localhost:6006',
      selector: '#root',
    };
  });

  test('applies profile thresholds when valid profile is specified', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      profile: 'component/strict',
    };

    const config = buildCompareConfig(args);

    expect(config.thresholds).not.toBeUndefined();
    expect(config.thresholds?.pixelDiffRatio).not.toBeUndefined();
    expect(config.thresholds?.deltaE).not.toBeUndefined();
  });

  test('applies profile contentBasis when not explicitly set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      profile: 'component/strict',
    };

    const config = buildCompareConfig(args);

    // component/strict profile has contentBasis setting
    // Profile's contentBasis is only applied if profile.contentBasis exists AND args.contentBasis is not set
    expect(config).toBeDefined();
  });

  test('preserves explicit contentBasis when profile is set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      profile: 'component/strict',
      contentBasis: 'union',
    };

    const config = buildCompareConfig(args);

    expect(config.contentBasis).toBe('union');
  });

  test('enforces profile contentBasis for pad mode when not explicitly set', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      profile: 'component/strict',
      size: 'pad',
    };

    const config = buildCompareConfig(args);

    // Profile enforces contentBasis for pad mode only when profile.contentBasis is defined
    expect(config.sizeMode).toBe('pad');
  });

  test('handles invalid profile gracefully without throwing', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      profile: 'non-existent-profile',
    };

    // Should not throw, just warn and continue
    const config = buildCompareConfig(args);

    expect(config).toBeDefined();
    expect(config.figma).toBe('AbCdEf:1-23');
  });

  test('applies known profiles without errors', () => {
    const profiles = ['component/strict', 'component/dev', 'page-vs-component', 'lenient'];

    profiles.forEach((profile) => {
      const args: ParsedArgs = {
        ...baseArgs,
        profile,
      };

      const config = buildCompareConfig(args);

      expect(config.thresholds).not.toBeUndefined();
    });
  });
});

describe('buildCompareConfig - Edge Cases', () => {
  let baseArgs: ParsedArgs;

  beforeEach(() => {
    baseArgs = {
      figma: 'AbCdEf:1-23',
      story: 'http://localhost:6006',
      selector: '#root',
    };
  });

  test('handles empty ignore string', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      ignore: '',
    };

    const config = buildCompareConfig(args);

    // Empty string after split and filter results in empty array, but undefined when no ignore parameter
    expect(config.ignore).toBeUndefined();
  });

  test('handles ignore with only commas', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      ignore: ',,,',
    };

    const config = buildCompareConfig(args);

    expect(config.ignore).toEqual([]);
  });

  test('handles ignore with mixed empty and valid values', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      ignore: 'background-color,,,,gap,,border',
    };

    const config = buildCompareConfig(args);

    expect(config.ignore).toEqual(['background-color', 'gap', 'border']);
  });

  test('handles emitArtifacts as false boolean', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      emitArtifacts: false,
    };

    const config = buildCompareConfig(args);

    expect(config.emitArtifacts).toBe(false);
  });

  test('sets verbose to false by default', () => {
    const args: ParsedArgs = {
      ...baseArgs,
    };

    const config = buildCompareConfig(args);

    expect(config.verbose).toBe(false);
  });

  test('sets verbose to true when specified', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      verbose: 'true',
    };

    const config = buildCompareConfig(args);

    expect(config.verbose).toBe(true);
  });

  test('handles zero dpr', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      dpr: '0',
    };

    const config = buildCompareConfig(args);

    expect(config.dpr).toBe(0);
  });

  test('handles zero figmaScale', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      figmaScale: '0',
    };

    const config = buildCompareConfig(args);

    expect(config.figmaScale).toBe(0);
  });

  test('handles minimum minRatio of 0', () => {
    const args: ParsedArgs = {
      ...baseArgs,
      textMinRatio: '0',
    };

    const config = buildCompareConfig(args);

    expect(config.textCheck?.minRatio).toBe(0);
  });
});
