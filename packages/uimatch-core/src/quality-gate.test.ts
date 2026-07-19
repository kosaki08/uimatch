import { describe, expect, test } from 'vitest';
import type { CompareImageResult } from './core/compare';
import {
  calculateAreaGap,
  calculateCQI,
  detectSuspicions,
  evaluateQualityGate,
} from './core/quality-gate';
import type { StyleDiff } from './types/index';

describe('Quality Gate', () => {
  test('should keep zero-area gap calculations finite', () => {
    expect(calculateAreaGap({ width: 0, height: 0 }, { width: 0, height: 0 })).toBe(0);
    expect(calculateAreaGap({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(1);
  });

  test.each([
    ['NaN Figma width', { width: Number.NaN, height: 100 }, { width: 100, height: 100 }],
    ['infinite Figma height', { width: 100, height: Infinity }, { width: 100, height: 100 }],
    ['overflowing Figma area', { width: Number.MAX_VALUE, height: 2 }, { width: 100, height: 100 }],
    ['negative implementation width', { width: 100, height: 100 }, { width: -1, height: 100 }],
  ])('should reject %s in area-gap dimensions', (_name, figma, impl) => {
    expect(() => calculateAreaGap(figma, impl)).toThrow(RangeError);
  });

  test('should use root identity instead of the display selector for suspicion detection', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      pixelDiffRatioContent: 0.005,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };
    const styleDiffs: StyleDiff[] = [
      {
        selector: 'main.app',
        isRoot: true,
        properties: {
          color: { actual: '#000', expected: '#111' },
        },
        severity: 'low',
      },
    ];

    const suspicions = detectSuspicions(result, styleDiffs);

    expect(suspicions.reasons).toContain(
      'Only root style diff present despite low pixel difference - possible incomplete comparison'
    );
  });

  test.each(['__self__', 'self'])('should support legacy root selector %s', (selector) => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      pixelDiffRatioContent: 0.005,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };
    const styleDiffs: StyleDiff[] = [
      {
        selector,
        properties: {
          color: { actual: '#000', expected: '#111' },
        },
        severity: 'low',
      },
    ];

    expect(detectSuspicions(result, styleDiffs).detected).toBe(true);
  });

  test('should prefer explicit root identity over a legacy selector', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      pixelDiffRatioContent: 0.005,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };
    const styleDiffs: StyleDiff[] = [
      {
        selector: 'self',
        isRoot: false,
        properties: {
          color: { actual: '#000', expected: '#111' },
        },
        severity: 'low',
      },
    ];

    expect(detectSuspicions(result, styleDiffs).detected).toBe(false);
  });

  test('should define zero-threshold CQI penalties without producing NaN', () => {
    const zeroMetrics = {
      pixelDiffRatio: 0,
      colorDeltaEAvg: 0,
      areaGap: 0,
      hasHighSeverity: false,
    };

    const zeroAtZero = calculateCQI(zeroMetrics, {
      pixelDiffRatio: 0,
      deltaE: 0,
    });
    const positiveAtZero = calculateCQI(
      { ...zeroMetrics, pixelDiffRatio: 0.01 },
      { pixelDiffRatio: 0, deltaE: 0 }
    );

    expect(zeroAtZero.cqi).toBe(100);
    expect(Number.isFinite(zeroAtZero.cqi)).toBe(true);
    expect(positiveAtZero.cqi).toBe(40);
  });

  test.each([
    ['negative pixel metric', -1, 0.01, 0, 3, 0],
    ['NaN pixel metric', Number.NaN, 0.01, 0, 3, 0],
    ['negative pixel threshold', 0, -1, 0, 3, 0],
    ['NaN pixel threshold', 0, Number.NaN, 0, 3, 0],
    ['negative color metric', 0, 0.01, -1, 3, 0],
    ['NaN color metric', 0, 0.01, Number.NaN, 3, 0],
    ['negative color threshold', 0, 0.01, 0, -1, 0],
    ['NaN color threshold', 0, 0.01, 0, Number.NaN, 0],
    ['negative area gap', 0, 0.01, 0, 3, -1],
    ['NaN area gap', 0, 0.01, 0, 3, Number.NaN],
  ])(
    'should reject %s in CQI calculation',
    (_name, pixelMetric, pixelThreshold, colorMetric, colorThreshold, areaGap) => {
      expect(() =>
        calculateCQI(
          {
            pixelDiffRatio: pixelMetric,
            colorDeltaEAvg: colorMetric,
            areaGap,
            hasHighSeverity: false,
          },
          {
            pixelDiffRatio: pixelThreshold,
            deltaE: colorThreshold,
          }
        )
      ).toThrow(RangeError);
    }
  );

  test.each([
    [
      'global pixel ratio above one',
      { pixelDiffRatio: 1.01, colorDeltaEAvg: 0, areaGap: 0, hasHighSeverity: false },
    ],
    [
      'global pixel ratio above one when a content ratio is present',
      {
        pixelDiffRatio: 1.01,
        pixelDiffRatioContent: 0,
        colorDeltaEAvg: 0,
        areaGap: 0,
        hasHighSeverity: false,
      },
    ],
    [
      'content pixel ratio above one',
      {
        pixelDiffRatio: 0,
        pixelDiffRatioContent: 1.01,
        colorDeltaEAvg: 0,
        areaGap: 0,
        hasHighSeverity: false,
      },
    ],
    [
      'area gap above one',
      { pixelDiffRatio: 0, colorDeltaEAvg: 0, areaGap: 1.01, hasHighSeverity: false },
    ],
  ])('should reject %s in CQI calculation', (_name, metrics) => {
    expect(() =>
      calculateCQI(metrics, {
        pixelDiffRatio: 0.01,
        deltaE: 3,
      })
    ).toThrow(RangeError);
  });

  test.each(['pixelWeight', 'colorWeight', 'areaWeight', 'severityWeight'] as const)(
    'should reject invalid %s values',
    (weightName) => {
      for (const invalidWeight of [Number.NaN, Infinity, -0.01, 1.01]) {
        expect(() =>
          calculateCQI(
            {
              pixelDiffRatio: 0,
              colorDeltaEAvg: 0,
              areaGap: 0,
              hasHighSeverity: false,
            },
            { pixelDiffRatio: 0.01, deltaE: 3 },
            { [weightName]: invalidWeight }
          )
        ).toThrow(RangeError);
      }
    }
  );

  test('should accept zero and valid custom CQI weights', () => {
    const result = calculateCQI(
      {
        pixelDiffRatio: 0.01,
        colorDeltaEAvg: 3,
        areaGap: 1,
        hasHighSeverity: true,
      },
      { pixelDiffRatio: 0.01, deltaE: 3 },
      {
        pixelWeight: 0,
        colorWeight: 0.25,
        areaWeight: 0.25,
        severityWeight: 0.25,
      }
    );

    expect(result.cqi).toBe(25);
  });

  test.each([
    ['negative pixel threshold', { pixelDiffRatio: -1, deltaE: 3 }],
    ['NaN pixel threshold', { pixelDiffRatio: Number.NaN, deltaE: 3 }],
    ['pixel threshold above one', { pixelDiffRatio: 1.1, deltaE: 3 }],
    ['negative color threshold', { pixelDiffRatio: 0.01, deltaE: -1 }],
    ['NaN color threshold', { pixelDiffRatio: 0.01, deltaE: Number.NaN }],
    ['negative critical area threshold', { pixelDiffRatio: 0.01, deltaE: 3, areaGapCritical: -1 }],
    ['NaN warning area threshold', { pixelDiffRatio: 0.01, deltaE: 3, areaGapWarning: Number.NaN }],
    [
      'warning area threshold above critical threshold',
      { pixelDiffRatio: 0.01, deltaE: 3, areaGapCritical: 0.2, areaGapWarning: 0.21 },
    ],
    [
      'negative high-severity limit',
      { pixelDiffRatio: 0.01, deltaE: 3, maxHighSeverityIssues: -1 },
    ],
    [
      'NaN high-severity limit',
      { pixelDiffRatio: 0.01, deltaE: 3, maxHighSeverityIssues: Number.NaN },
    ],
    [
      'non-integer layout high-severity limit',
      { pixelDiffRatio: 0.01, deltaE: 3, maxLayoutHighIssues: 1.5 },
    ],
  ])('should reject %s in quality-gate thresholds', (_name, thresholds) => {
    expect(() =>
      calculateCQI(
        {
          pixelDiffRatio: 0,
          colorDeltaEAvg: 0,
          areaGap: 0,
          hasHighSeverity: false,
        },
        thresholds
      )
    ).toThrow(RangeError);
  });

  test('should maintain core interface', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };

    const gate = evaluateQualityGate(result, [], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
    });

    // Core fields must always be present
    expect(gate.pass).toBeDefined();
    expect(gate.reasons).toBeDefined();
    expect(gate.thresholds).toBeDefined();
    expect(gate.thresholds.pixelDiffRatio).toBe(0.01);
    expect(gate.thresholds.deltaE).toBe(3.0);
    expect(gate.thresholds.areaGapCritical).toBe(0.15);
    expect(gate.thresholds.areaGapWarning).toBe(0.05);
    expect(gate.thresholds.maxHighSeverityIssues).toBe(0);
  });

  test('should include advanced quality metrics', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      colorDeltaEAvg: 2.0,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 102, height: 102 },
        compared: { width: 102, height: 102 },
        sizeMode: 'pad',
        adjusted: true,
      },
    };

    const gate = evaluateQualityGate(
      result,
      [],
      {
        pixelDiffRatio: 0.01,
        deltaE: 3.0,
        areaGapCritical: 0.15,
        areaGapWarning: 0.05,
      },
      'union'
    );

    // Advanced metrics fields should be present
    expect(gate.cqi).toBeDefined();
    expect(gate.hardGateViolations).toBeDefined();
    expect(gate.suspicions).toBeDefined();
    expect(gate.reEvaluated).toBeDefined();
  });

  test('existing code should work unchanged', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.02,
      colorDeltaEAvg: 5.0,
      diffPixelCount: 200,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };

    const gate = evaluateQualityGate(result, [], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
    });

    // Existing code patterns should work
    if (gate.pass) {
      // Success path
    } else {
      // Failure path - reasons should be populated
      expect(gate.reasons.length).toBeGreaterThan(0);
    }

    gate.reasons.forEach((reason) => {
      expect(typeof reason).toBe('string');
    });

    expect(gate.pass).toBe(false);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });

  test('should detect high severity style diffs', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.001,
      colorDeltaEAvg: 1.0,
      diffPixelCount: 10,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };

    const styleDiffs: StyleDiff[] = [
      {
        selector: '#test',
        properties: {
          width: {
            expected: '100px',
            actual: '150px',
          },
        },
        severity: 'high',
      },
    ];

    const gate = evaluateQualityGate(result, styleDiffs, {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
    });

    expect(gate.pass).toBe(false);
    expect(gate.hardGateViolations?.some((v) => v.type === 'high_severity')).toBe(true);
    expect(gate.reasons).toContain('[HIGH] High severity count 1 exceeds maximum 0');
  });

  test('should count high-severity limits by StyleDiff entry while retaining the CQI penalty', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.001,
      colorDeltaEAvg: 1.0,
      diffPixelCount: 10,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };
    const firstDiff: StyleDiff = {
      selector: '#first',
      properties: {
        color: { actual: '#000', expected: '#fff' },
        'background-color': { actual: '#000', expected: '#fff' },
      },
      severity: 'high',
    };
    const secondDiff: StyleDiff = {
      selector: '#second',
      properties: {
        color: { actual: '#000', expected: '#fff' },
      },
      severity: 'high',
    };

    const allowed = evaluateQualityGate(result, [firstDiff], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
      maxHighSeverityIssues: 1,
    });
    const exceeded = evaluateQualityGate(result, [firstDiff, secondDiff], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
      maxHighSeverityIssues: 1,
    });

    expect(allowed.pass).toBe(true);
    expect(allowed.thresholds.maxHighSeverityIssues).toBe(1);
    expect(
      allowed.cqiBreakdown?.components.find((component) => component.name === 'severity')?.penalty
    ).toBeGreaterThan(0);
    expect(exceeded.pass).toBe(false);
    expect(exceeded.reasons).toContain('[HIGH] High severity count 2 exceeds maximum 1');
  });

  test('should apply the layout high-severity limit only when configured', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.001,
      colorDeltaEAvg: 1.0,
      diffPixelCount: 10,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };
    const layoutDiff: StyleDiff = {
      selector: '#test',
      properties: {
        display: { actual: 'block', expected: 'flex' },
        'grid-template-columns': { actual: '1fr', expected: '1fr 1fr' },
      },
      severity: 'high',
    };

    const notConfigured = evaluateQualityGate(result, [layoutDiff], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
      maxHighSeverityIssues: 1,
    });
    const exceeded = evaluateQualityGate(result, [layoutDiff], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
      maxHighSeverityIssues: 1,
      maxLayoutHighIssues: 0,
    });

    expect(notConfigured.pass).toBe(true);
    expect(notConfigured.reasons.some((reason) => reason.includes('Layout high severity'))).toBe(
      false
    );
    expect(exceeded.pass).toBe(false);
    expect(exceeded.thresholds.maxLayoutHighIssues).toBe(0);
    expect(exceeded.reasons).toContain('[HIGH] Layout high severity count 1 exceeds maximum 0');
  });

  test('should use pixelDiffRatioContent when available', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      pixelDiffRatioContent: 0.015,
      colorDeltaEAvg: 1.0,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 102, height: 102 },
        compared: { width: 102, height: 102 },
        sizeMode: 'pad',
        adjusted: true,
      },
    };

    const gate = evaluateQualityGate(result, [], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
    });

    expect(gate.pass).toBe(false);
    expect(gate.reasons.some((r) => r.includes('pixelDiffRatioContent'))).toBe(true);
    expect(gate.reasons.some((r) => r.includes('1.50%'))).toBe(true); // 0.015 * 100
  });

  test('should pass when all metrics are within thresholds', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      colorDeltaEAvg: 2.0,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };

    const gate = evaluateQualityGate(result, [], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
    });

    expect(gate.pass).toBe(true);
    expect(gate.reasons).toEqual([]);
  });

  test('should calculate CQI score', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      colorDeltaEAvg: 2.0,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 100, height: 100 },
        compared: { width: 100, height: 100 },
        sizeMode: 'strict',
        adjusted: false,
      },
    };

    const gate = evaluateQualityGate(result, [], {
      pixelDiffRatio: 0.01,
      deltaE: 3.0,
    });

    expect(gate.cqi).toBeDefined();
    expect(gate.cqi).toBeGreaterThanOrEqual(0);
    expect(gate.cqi).toBeLessThanOrEqual(100);
  });

  test('should pass when area gap is large but other metrics are OK', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      colorDeltaEAvg: 2.0,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 130, height: 130 }, // 30% larger area
        compared: { width: 130, height: 130 },
        sizeMode: 'pad',
        adjusted: true,
      },
    };

    const gate = evaluateQualityGate(
      result,
      [],
      {
        pixelDiffRatio: 0.01,
        deltaE: 3.0,
        areaGapCritical: 0.15, // 15% critical threshold
      },
      'union'
    );

    // Should pass because other metrics are OK
    expect(gate.pass).toBe(true);
    // Area gap violation should still be recorded in hardGateViolations
    expect(gate.hardGateViolations?.some((v) => v.type === 'area_gap')).toBe(true);
    // Should have a reason explaining the area gap was downgraded to warning
    expect(gate.reasons.some((r) => r.includes('treating area gap as warning'))).toBe(true);
  });

  test('should fail when area gap is large AND other metrics fail', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.02, // Exceeds threshold
      colorDeltaEAvg: 2.0,
      diffPixelCount: 200,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 130, height: 130 }, // 30% larger area
        compared: { width: 130, height: 130 },
        sizeMode: 'pad',
        adjusted: true,
      },
    };

    const gate = evaluateQualityGate(
      result,
      [],
      {
        pixelDiffRatio: 0.01,
        deltaE: 3.0,
        areaGapCritical: 0.15,
      },
      'union'
    );

    // Should fail because pixelDiffRatio exceeds threshold
    expect(gate.pass).toBe(false);
    expect(gate.hardGateViolations?.some((v) => v.type === 'area_gap')).toBe(true);
    expect(gate.reasons.some((r) => r.includes('[CRITICAL]'))).toBe(true);
  });

  test('should exclude suspicions from gating violations', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      pixelDiffRatioContent: 0.005,
      colorDeltaEAvg: 2.0,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      contentCoverage: 0.98,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 130, height: 130 },
        compared: { width: 130, height: 130 },
        sizeMode: 'pad',
        adjusted: true,
        contentRect: { x1: 0, y1: 0, x2: 130, y2: 130 },
      },
    };

    const gate = evaluateQualityGate(
      result,
      [],
      {
        pixelDiffRatio: 0.01,
        deltaE: 3.0,
        areaGapCritical: 0.15,
      },
      'union'
    );

    // Should pass even if suspicions are detected
    expect(gate.pass).toBe(true);
    // Suspicions should be recorded
    expect(gate.suspicions.detected).toBe(true);
    // But should not fail the gate
    expect(gate.hardGateViolations?.some((v) => v.type === 'suspicion')).toBe(true);
    // Suspicion reasons should be added to reasons array
    expect(gate.reasons.some((r) => r.includes('[SUSPICION]'))).toBe(true);
  });

  test('should fail when area gap is large with failing styleCoverage', () => {
    const result: CompareImageResult = {
      pixelDiffRatio: 0.005,
      colorDeltaEAvg: 2.0,
      diffPixelCount: 50,
      diffPngB64: '',
      totalPixels: 10000,
      dimensions: {
        figma: { width: 100, height: 100 },
        impl: { width: 130, height: 130 },
        compared: { width: 130, height: 130 },
        sizeMode: 'pad',
        adjusted: true,
      },
    };

    const gate = evaluateQualityGate(
      result,
      [],
      {
        pixelDiffRatio: 0.01,
        deltaE: 3.0,
        areaGapCritical: 0.15,
        minStyleCoverage: 0.8,
      },
      'union',
      undefined,
      { coverage: 0.5 } // Low style coverage
    );

    // Should fail because area gap cannot be downgraded when styleCoverage is low
    expect(gate.pass).toBe(false);
    // The failure reason should mention area gap (since it's the gating violation)
    expect(gate.reasons.some((r) => r.includes('Area gap'))).toBe(true);
    // Area gap should be in hardGateViolations
    expect(gate.hardGateViolations?.some((v) => v.type === 'area_gap')).toBe(true);
  });
});
