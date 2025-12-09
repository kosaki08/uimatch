import { describe, expect, test } from 'bun:test';
import type { CompareImageResult } from './core/compare';
import { evaluateQualityGate } from './core/quality-gate';
import type { StyleDiff } from './types/index';

describe('Quality Gate', () => {
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
