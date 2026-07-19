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
