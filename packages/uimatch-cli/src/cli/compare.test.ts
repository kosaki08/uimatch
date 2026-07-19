import { getQualityGateProfile } from '@uimatch/core';
import { describe, expect, test } from 'bun:test';
import type { CompareResult } from '../types/index';
import type { ParsedArgs } from './compare';
import { buildCompareConfig, evaluateGateDecision } from './compare';

function createReport(pass: boolean): CompareResult['report'] {
  return {
    metrics: {
      pixelDiffRatio: pass ? 0 : 1,
      colorDeltaEAvg: pass ? 0 : 100,
      dfs: pass ? 100 : 0,
    },
    styleDiffs: [],
    qualityGate: {
      pass,
      cqi: pass ? 100 : 0,
      hardGateViolations: [],
      suspicions: { detected: false, reasons: [] },
      reEvaluated: false,
      reasons: [],
      thresholds: { pixelDiffRatio: 0.01, deltaE: 3 },
    },
  };
}

describe('buildCompareConfig', () => {
  describe('emitArtifacts auto-enable', () => {
    test('should enable emitArtifacts when outDir is specified', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        outDir: './out',
      };

      const config = buildCompareConfig(args);

      expect(config.emitArtifacts).toBe(true);
    });

    test('should enable emitArtifacts when explicitly set', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        emitArtifacts: true,
      };

      const config = buildCompareConfig(args);

      expect(config.emitArtifacts).toBe(true);
    });

    test('should not enable emitArtifacts by default', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.emitArtifacts).toBe(false);
    });
  });

  describe('viewport parsing', () => {
    test('should parse viewport with lowercase x', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        viewport: '1584x1104',
      };

      const config = buildCompareConfig(args);

      expect(config.viewport).toEqual({ width: 1584, height: 1104 });
    });

    test('should parse viewport with uppercase X', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        viewport: '1920X1080',
      };

      const config = buildCompareConfig(args);

      expect(config.viewport).toEqual({ width: 1920, height: 1080 });
    });

    test('should skip invalid viewport', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        viewport: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.viewport).toBeUndefined();
    });
  });

  describe('dpr parsing', () => {
    test('should parse valid dpr', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        dpr: '2',
      };

      const config = buildCompareConfig(args);

      expect(config.dpr).toBe(2);
    });

    test('should skip invalid dpr', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        dpr: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.dpr).toBeUndefined();
    });
  });

  describe('figmaScale parsing', () => {
    test('should parse valid figmaScale', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        figmaScale: '3',
      };

      const config = buildCompareConfig(args);

      expect(config.figmaScale).toBe(3);
    });

    test('should parse decimal figmaScale', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        figmaScale: '2.5',
      };

      const config = buildCompareConfig(args);

      expect(config.figmaScale).toBe(2.5);
    });

    test('should skip invalid figmaScale', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        figmaScale: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.figmaScale).toBeUndefined();
    });
  });

  describe('figmaAutoRoi parsing', () => {
    test('should parse figmaAutoRoi=true', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        figmaAutoRoi: 'true',
      };

      const config = buildCompareConfig(args);

      expect(config.figmaAutoRoi).toBe(true);
    });

    test('should parse figmaAutoRoi=false', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        figmaAutoRoi: 'false',
      };

      const config = buildCompareConfig(args);

      expect(config.figmaAutoRoi).toBe(false);
    });

    test('should keep figmaAutoRoi undefined when not specified', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.figmaAutoRoi).toBeUndefined();
    });
  });

  describe('size mode parsing', () => {
    test.each(['strict', 'pad', 'crop', 'scale'] as const)(
      'should parse valid size mode: %s',
      (mode) => {
        const args: ParsedArgs = {
          figma: 'AbCdEf:1-23',
          story: 'http://localhost:6006',
          selector: '#root',
          size: mode,
        };

        const config = buildCompareConfig(args);

        expect(config.sizeMode).toBe(mode);
      }
    );

    test('should skip invalid size mode', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        size: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.sizeMode).toBeUndefined();
    });
  });

  describe('alignment parsing', () => {
    test.each(['center', 'top-left', 'top', 'left'] as const)(
      'should parse valid alignment: %s',
      (align) => {
        const args: ParsedArgs = {
          figma: 'AbCdEf:1-23',
          story: 'http://localhost:6006',
          selector: '#root',
          align,
        };

        const config = buildCompareConfig(args);

        expect(config.align).toBe(align);
      }
    );
  });

  describe('contentBasis parsing', () => {
    test.each(['union', 'intersection', 'figma', 'impl'] as const)(
      'should parse valid contentBasis: %s',
      (basis) => {
        const args: ParsedArgs = {
          figma: 'AbCdEf:1-23',
          story: 'http://localhost:6006',
          selector: '#root',
          contentBasis: basis,
        };

        const config = buildCompareConfig(args);

        expect(config.contentBasis).toBe(basis);
      }
    );
  });

  describe('padColor parsing', () => {
    test('should parse hex color', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        padColor: '#FF5733',
      };

      const config = buildCompareConfig(args);

      expect(config.padColor).toEqual({ r: 255, g: 87, b: 51 });
    });

    test('should parse auto padColor', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        padColor: 'auto',
      };

      const config = buildCompareConfig(args);

      expect(config.padColor).toBe('auto');
    });

    test('should skip invalid padColor', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        padColor: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.padColor).toBeUndefined();
    });
  });

  describe('detectStorybookIframe auto-default', () => {
    test('should auto-enable for Storybook iframe URL', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006/iframe.html?id=button--default',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.detectStorybookIframe).toBe(true);
    });

    test('should not auto-enable for non-Storybook URL', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:3000/button',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.detectStorybookIframe).toBe(false);
    });

    test('should respect explicit true override', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:3000/button',
        selector: '#root',
        detectStorybookIframe: 'true',
      };

      const config = buildCompareConfig(args);

      expect(config.detectStorybookIframe).toBe(true);
    });

    test('should respect explicit false override', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006/iframe.html?id=button--default',
        selector: '#root',
        detectStorybookIframe: 'false',
      };

      const config = buildCompareConfig(args);

      expect(config.detectStorybookIframe).toBe(false);
    });
  });

  describe('bootstrap flag', () => {
    test('should default to true', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.bootstrapExpectedFromFigma).toBe(true);
    });

    test('should parse true', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        bootstrap: 'true',
      };

      const config = buildCompareConfig(args);

      expect(config.bootstrapExpectedFromFigma).toBe(true);
    });

    test('should parse false', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        bootstrap: 'false',
      };

      const config = buildCompareConfig(args);

      expect(config.bootstrapExpectedFromFigma).toBe(false);
    });
  });

  describe('smart defaults for pad mode', () => {
    test('should not apply smart defaults in buildCompareConfig (now handled in uiMatchCompare)', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        size: 'pad',
      };

      const config = buildCompareConfig(args);

      expect(config.sizeMode).toBe('pad');
      expect(config.align).toBeUndefined();
      expect(config.contentBasis).toBeUndefined();
    });

    test('should respect explicit align when size=pad', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        size: 'pad',
        align: 'center',
      };

      const config = buildCompareConfig(args);

      expect(config.align).toBe('center');
    });

    test('should respect explicit contentBasis when size=pad', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        size: 'pad',
        contentBasis: 'union',
      };

      const config = buildCompareConfig(args);

      expect(config.contentBasis).toBe('union');
    });

    test('should not apply smart defaults when size is not pad', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        size: 'strict',
      };

      const config = buildCompareConfig(args);

      expect(config.align).toBeUndefined();
      expect(config.contentBasis).toBeUndefined();
    });
  });

  describe('quality gate profiles', () => {
    test('should pass high-severity limits to the core comparison', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
      };
      const profile = getQualityGateProfile('page-vs-component');

      const config = buildCompareConfig(args, profile);

      expect(config.thresholds?.maxHighSeverityIssues).toBe(2);
      expect(config.thresholds?.maxLayoutHighIssues).toBe(0);
    });

    test.each(['', '-0.1', 'NaN', 'Infinity', '0.1junk', '1.1'])(
      'should reject invalid area gap threshold %s',
      (areaGapCritical) => {
        const args: ParsedArgs = {
          figma: 'AbCdEf:1-23',
          story: 'http://localhost:6006',
          selector: '#root',
          areaGapCritical,
        };

        expect(() => buildCompareConfig(args)).toThrow(RangeError);
      }
    );
  });

  describe('ignore parsing', () => {
    test('should parse comma-separated ignore list', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        ignore: 'background-color,gap,border-width',
      };

      const config = buildCompareConfig(args);

      expect(config.ignore).toEqual(['background-color', 'gap', 'border-width']);
    });

    test('should trim whitespace from ignore properties', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        ignore: ' background-color , gap , border-width ',
      };

      const config = buildCompareConfig(args);

      expect(config.ignore).toEqual(['background-color', 'gap', 'border-width']);
    });

    test('should filter empty strings from ignore list', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        ignore: 'background-color,,gap',
      };

      const config = buildCompareConfig(args);

      expect(config.ignore).toEqual(['background-color', 'gap']);
    });
  });

  describe('weights parsing', () => {
    test('should parse valid JSON weights', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        weights: '{"color":0.5,"spacing":1,"typography":1}',
      };

      const config = buildCompareConfig(args);

      expect(config.weights).toEqual({
        color: 0.5,
        spacing: 1,
        typography: 1,
      });
    });

    test('should handle invalid JSON weights gracefully', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        weights: 'invalid json',
      };

      const config = buildCompareConfig(args);

      expect(config.weights).toBeUndefined();
    });
  });
});

describe('evaluateGateDecision', () => {
  test('fails when the base quality gate fails', () => {
    const decision = evaluateGateDecision(createReport(false), {});

    expect(decision.finalPass).toBe(false);
  });

  test('allows an enabled text gate to override a visual failure', () => {
    const report = createReport(false);
    report.textMatch = {
      enabled: true,
      mode: 'self',
      normalize: 'nfkc_ws',
      caseSensitive: false,
      match: 'exact',
      minRatio: 1,
      figma: { raw: 'Save', normalized: 'save' },
      impl: { raw: 'Save', normalized: 'save' },
      equal: true,
      ratio: 1,
    };

    const decision = evaluateGateDecision(report, { textGate: true });

    expect(decision.finalPass).toBe(true);
    expect(decision.notices).toContain('✅ Text gate: PASS (text match)');
  });

  test('uses the core quality gate result for profile output', () => {
    const report = createReport(false);
    if (!report.qualityGate) throw new Error('Expected quality gate report');
    report.qualityGate.reasons = ['[HIGH] Layout high severity count 1 exceeds maximum 0'];

    const decision = evaluateGateDecision(report, {}, getQualityGateProfile('component/strict'));

    expect(decision.finalPass).toBe(false);
    expect(decision.profile?.pass).toBe(false);
    expect(decision.profile?.reasons).toEqual(report.qualityGate.reasons);
  });

  test('does not recalculate profile limits from reporting summaries', () => {
    const report = createReport(true);
    report.styleDiffs.push({
      selector: '#target',
      properties: {
        display: { expected: 'flex', actual: 'block' },
        'grid-template-columns': { expected: '1fr 1fr', actual: '1fr' },
      },
      severity: 'high',
    });
    report.styleSummary = {
      styleFidelityScore: 0,
      highCount: 2,
      mediumCount: 0,
      lowCount: 0,
      totalDiffs: 2,
      categoryBreakdown: [],
      coverage: 1,
      autofixableCount: 0,
    };

    const decision = evaluateGateDecision(report, {}, getQualityGateProfile('component/strict'));

    expect(decision.finalPass).toBe(true);
    expect(decision.profile?.pass).toBe(true);
  });
});
