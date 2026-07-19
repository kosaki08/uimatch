import { describe, expect, test } from 'vitest';
import { ResolutionSchema, isSelectorResolverPlugin } from './index.js';

describe('ResolutionSchema', () => {
  test('accepts a valid selector resolution', () => {
    expect(
      ResolutionSchema.parse({
        selector: '[data-testid="submit"]',
        stabilityScore: 95,
        reasons: ['Stable test id'],
      })
    ).toEqual({
      selector: '[data-testid="submit"]',
      stabilityScore: 95,
      reasons: ['Stable test id'],
    });
  });

  test.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an out-of-contract stability score: %s',
    (stabilityScore) => {
      expect(() => ResolutionSchema.parse({ selector: '#submit', stabilityScore })).toThrow();
    }
  );

  test('rejects an empty selector', () => {
    expect(() => ResolutionSchema.parse({ selector: '' })).toThrow();
  });

  test.each([' ', '\t', '\n', ' \t\n '])('rejects a whitespace-only selector: %j', (selector) => {
    expect(() => ResolutionSchema.parse({ selector })).toThrow();
  });

  test.each([' ', '\t', '\n', ' \t\n '])(
    'rejects a whitespace-only subselector: %j',
    (subselector) => {
      expect(() => ResolutionSchema.parse({ selector: '#submit', subselector })).toThrow();
    }
  );

  test('preserves meaningful surrounding selector whitespace', () => {
    expect(ResolutionSchema.parse({ selector: ' #submit ' }).selector).toBe(' #submit ');
  });
});

describe('isSelectorResolverPlugin', () => {
  test('requires plugin identity and a resolve function', () => {
    expect(
      isSelectorResolverPlugin({
        name: 'example',
        version: '1.0.0',
        resolve: () => Promise.resolve({ selector: '#target' }),
      })
    ).toBe(true);
    expect(
      isSelectorResolverPlugin({ resolve: () => Promise.resolve({ selector: '#target' }) })
    ).toBe(false);
  });
});
