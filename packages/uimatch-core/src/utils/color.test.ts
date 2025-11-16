/**
 * Unit tests for color conversion and deltaE2000 calculation
 */

import { describe, expect, test as it } from 'bun:test';
import { deltaE2000, rgbToLab } from './color';
import type { RGB } from './normalize';

describe('rgbToLab', () => {
  it('should convert pure white to Lab', () => {
    const white: RGB = { r: 255, g: 255, b: 255 };
    const lab = rgbToLab(white);

    // White in Lab should be L=100, a≈0, b≈0
    expect(lab.L).toBeCloseTo(100, 0);
    expect(lab.a).toBeCloseTo(0, 0);
    expect(lab.b).toBeCloseTo(0, 0);
  });

  it('should convert pure black to Lab', () => {
    const black: RGB = { r: 0, g: 0, b: 0 };
    const lab = rgbToLab(black);

    // Black in Lab should be L=0, a≈0, b≈0
    expect(lab.L).toBeCloseTo(0, 0);
    expect(lab.a).toBeCloseTo(0, 0);
    expect(lab.b).toBeCloseTo(0, 0);
  });

  it('should convert pure red to Lab', () => {
    const red: RGB = { r: 255, g: 0, b: 0 };
    const lab = rgbToLab(red);

    // Red should have positive 'a' component
    expect(lab.L).toBeGreaterThan(0);
    expect(lab.a).toBeGreaterThan(0);
  });
});

describe('deltaE2000', () => {
  it('should return 0 for identical colors', () => {
    const color: RGB = { r: 128, g: 128, b: 128 };
    const dE = deltaE2000(color, color);

    expect(dE).toBe(0);
  });

  it('should return small value for perceptually similar colors', () => {
    const color1: RGB = { r: 100, g: 100, b: 100 };
    const color2: RGB = { r: 102, g: 102, b: 102 };

    const dE = deltaE2000(color1, color2);

    // Very similar grays should have deltaE < 3 (imperceptible)
    expect(dE).toBeLessThan(3);
  });

  it('should return large value for clearly different colors', () => {
    const black: RGB = { r: 0, g: 0, b: 0 };
    const white: RGB = { r: 255, g: 255, b: 255 };

    const dE = deltaE2000(black, white);

    // Black to white should be very large deltaE (>> 10)
    expect(dE).toBeGreaterThan(50);
  });

  it('should detect noticeable color difference', () => {
    // Microsoft blue: #0078D4 (0, 120, 212)
    const msBlue: RGB = { r: 0, g: 120, b: 212 };
    // Slightly lighter blue
    const lighterBlue: RGB = { r: 40, g: 140, b: 220 };

    const dE = deltaE2000(msBlue, lighterBlue);

    // Should be noticeable but not extreme (3-10 range)
    expect(dE).toBeGreaterThan(3);
    expect(dE).toBeLessThan(20);
  });

  it('should be symmetric (dE(A, B) = dE(B, A))', () => {
    const color1: RGB = { r: 100, g: 150, b: 200 };
    const color2: RGB = { r: 120, g: 160, b: 210 };

    const dE1 = deltaE2000(color1, color2);
    const dE2 = deltaE2000(color2, color1);

    expect(dE1).toBeCloseTo(dE2, 5);
  });

  it('should handle edge case: red to green', () => {
    const red: RGB = { r: 255, g: 0, b: 0 };
    const green: RGB = { r: 0, g: 255, b: 0 };

    const dE = deltaE2000(red, green);

    // Red to green is a large perceptual difference
    expect(dE).toBeGreaterThan(40);
  });

  it('should correctly identify imperceptible difference (deltaE < 1)', () => {
    const color1: RGB = { r: 128, g: 128, b: 128 };
    const color2: RGB = { r: 128, g: 128, b: 129 }; // +1 in blue

    const dE = deltaE2000(color1, color2);

    // Single unit RGB difference should be imperceptible
    expect(dE).toBeLessThan(1);
  });

  it('should correctly identify just-noticeable difference (deltaE ≈ 2-3)', () => {
    const color1: RGB = { r: 128, g: 128, b: 128 };
    const color2: RGB = { r: 133, g: 133, b: 133 }; // +5 in all channels

    const dE = deltaE2000(color1, color2);

    // This should be around the just-noticeable threshold
    expect(dE).toBeGreaterThan(1);
    expect(dE).toBeLessThan(5);
  });
});
