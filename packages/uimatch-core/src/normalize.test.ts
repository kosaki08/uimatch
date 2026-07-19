/**
 * Unit tests for normalize utilities
 */

import { describe, expect, test } from 'bun:test';
import {
  normLineHeight,
  normalizeText,
  parseBoxShadow,
  parseCssColorToRgb,
  toPx,
} from './utils/normalize';

describe('toPx', () => {
  test.each([
    ['16px', 16, 16],
    ['0px', 16, 0],
    ['1.5rem', 16, 24],
    ['2em', 16, 32],
    ['0', 16, 0],
    ['+16px', 16, 16],
    ['-1rem', 16, -16],
    ['.5em', 20, 10],
    ['1.', 16, 1],
    [' 24px ', 16, 24],
  ])('converts %s with base font size %i', (value, baseFontSize, expected) => {
    expect(toPx(value, baseFontSize)).toBe(expected);
  });

  test.each([
    ['missing value', undefined],
    ['empty value', ''],
    ['auto keyword', 'auto'],
    ['none keyword', 'none'],
    ['unknown keyword', 'invalid'],
    ['decimal point without digits', '.'],
    ['signed decimal point without digits', '+.'],
    ['multiple decimal points', '1.2.3px'],
    ['exponent notation', '1e3px'],
    ['whitespace before the unit', '16 px'],
    ['unsupported unit', '16pt'],
    ['trailing content', '16px trailing'],
    ['numeric overflow', `${'9'.repeat(400)}px`],
  ])('rejects %s', (_case, value) => {
    expect(toPx(value)).toBeUndefined();
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

  test('parses hsl() colors', () => {
    // Red: hsl(0, 100%, 50%)
    expect(parseCssColorToRgb('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0 });
    // Green: hsl(120, 100%, 50%)
    expect(parseCssColorToRgb('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0 });
    // Blue: hsl(240, 100%, 50%)
    expect(parseCssColorToRgb('hsl(240, 100%, 50%)')).toEqual({ r: 0, g: 0, b: 255 });
    // Gray: hsl(0, 0%, 50%)
    expect(parseCssColorToRgb('hsl(0, 0%, 50%)')).toEqual({ r: 128, g: 128, b: 128 });
  });

  test('parses hsla() colors', () => {
    expect(parseCssColorToRgb('hsla(0, 100%, 50%, 1)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColorToRgb('hsla(0, 100%, 50%, 0.5)')).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 0.5,
    });
  });

  test('parses hsl() with deg unit', () => {
    expect(parseCssColorToRgb('hsl(0deg, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseCssColorToRgb('hsl(120deg, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0 });
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

describe('normalizeText', () => {
  test('applies NFKC normalization', () => {
    // Half-width katakana → Full-width
    expect(normalizeText('ｶﾀｶﾅ')).toBe('カタカナ');
    // Full-width digits → Half-width
    expect(normalizeText('１２３')).toBe('123');
  });

  test('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
    expect(normalizeText('\t\nhello\n\t')).toBe('hello');
  });

  test('compresses consecutive whitespace', () => {
    expect(normalizeText('hello    world')).toBe('hello world');
    expect(normalizeText('hello\t\n  \nworld')).toBe('hello world');
  });

  test('handles combined normalization', () => {
    expect(normalizeText('  ｶﾀｶﾅ   １２３  ')).toBe('カタカナ 123');
    expect(normalizeText('\t\nhello\n\n  world\t')).toBe('hello world');
  });

  test('handles empty and whitespace-only strings', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
    expect(normalizeText('\t\n\r')).toBe('');
  });
});
