/**
 * Unit tests for normalize utilities
 */

import { describe, expect, test } from 'bun:test';
import { normLineHeight, parseBoxShadow, parseCssColorToRgb, toPx } from './utils/normalize';

describe('toPx', () => {
  test('converts px values', () => {
    expect(toPx('16px')).toBe(16);
    expect(toPx('24px')).toBe(24);
    expect(toPx('0px')).toBe(0);
  });

  test('converts rem values', () => {
    expect(toPx('1rem', 16)).toBe(16);
    expect(toPx('1.5rem', 16)).toBe(24);
    expect(toPx('2rem', 16)).toBe(32);
  });

  test('converts em values', () => {
    expect(toPx('1em', 16)).toBe(16);
    expect(toPx('1.5em', 16)).toBe(24);
    expect(toPx('2em', 16)).toBe(32);
  });

  test('handles unitless zero', () => {
    expect(toPx('0')).toBe(0);
  });

  test('returns undefined for invalid values', () => {
    expect(toPx('auto')).toBeUndefined();
    expect(toPx('none')).toBeUndefined();
    expect(toPx('invalid')).toBeUndefined();
    expect(toPx(undefined)).toBeUndefined();
  });

  test('handles negative values', () => {
    expect(toPx('-16px')).toBe(-16);
    expect(toPx('-1rem', 16)).toBe(-16);
  });
});

describe('normLineHeight', () => {
  test('converts normal to 1.2 * fontSize', () => {
    expect(normLineHeight('normal', 16)).toBeCloseTo(19.2);
    expect(normLineHeight('normal', 24)).toBeCloseTo(28.8);
  });

  test('converts unitless values', () => {
    expect(normLineHeight('1.5', 16)).toBe(24);
    expect(normLineHeight('2', 16)).toBe(32);
    expect(normLineHeight('1', 20)).toBe(20);
  });

  test('converts px values', () => {
    expect(normLineHeight('24px', 16)).toBe(24);
    expect(normLineHeight('32px', 16)).toBe(32);
  });

  test('returns undefined for invalid values', () => {
    expect(normLineHeight(undefined)).toBeUndefined();
    expect(normLineHeight('auto')).toBeUndefined();
  });
});

describe('parseCssColorToRgb', () => {
  test('parses 6-digit hex colors', () => {
    expect(parseCssColorToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseCssColorToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseCssColorToRgb('#0000FF')).toEqual({ r: 0, g: 0, b: 255 });
    expect(parseCssColorToRgb('#1E40AF')).toEqual({ r: 30, g: 64, b: 175 });
  });

  test('parses 3-digit hex colors', () => {
    expect(parseCssColorToRgb('#F00')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseCssColorToRgb('#0F0')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseCssColorToRgb('#00F')).toEqual({ r: 0, g: 0, b: 255 });
  });

  test('parses 8-digit hex colors with alpha', () => {
    expect(parseCssColorToRgb('#FF0000FF')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColorToRgb('#FF000080')).toEqual({ r: 255, g: 0, b: 0, a: 0.5019607843137255 });
  });

  test('parses rgb() colors', () => {
    expect(parseCssColorToRgb('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseCssColorToRgb('rgb(0, 255, 0)')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseCssColorToRgb('rgb(0, 0, 255)')).toEqual({ r: 0, g: 0, b: 255 });
  });

  test('parses rgba() colors', () => {
    expect(parseCssColorToRgb('rgba(255, 0, 0, 1)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColorToRgb('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
  });

  test('returns undefined for invalid colors', () => {
    expect(parseCssColorToRgb(undefined)).toBeUndefined();
    expect(parseCssColorToRgb('')).toBeUndefined();
    expect(parseCssColorToRgb('invalid')).toBeUndefined();
    expect(parseCssColorToRgb('#GGG')).toBeUndefined();
  });
});

describe('parseBoxShadow', () => {
  test('parses simple box-shadow', () => {
    const result = parseBoxShadow('0px 4px 8px #000000');
    expect(result).toEqual({
      blur: 8,
      rgb: { r: 0, g: 0, b: 0 },
    });
  });

  test('parses box-shadow with spread', () => {
    const result = parseBoxShadow('0px 4px 8px 2px rgba(0, 0, 0, 0.5)');
    expect(result).toEqual({
      blur: 8,
      rgb: { r: 0, g: 0, b: 0, a: 0.5 },
    });
  });

  test('returns undefined for none', () => {
    expect(parseBoxShadow('none')).toBeUndefined();
    expect(parseBoxShadow(undefined)).toBeUndefined();
  });

  test('handles negative offsets', () => {
    const result = parseBoxShadow('-2px -4px 8px #FF0000');
    expect(result).toEqual({
      blur: 8,
      rgb: { r: 255, g: 0, b: 0 },
    });
  });
});
