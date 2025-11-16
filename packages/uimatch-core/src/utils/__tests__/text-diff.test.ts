import { describe, expect, test } from 'bun:test';
import { compareText } from '../text-diff';

describe('compareText', () => {
  describe('exact-match', () => {
    test('identical texts', () => {
      const diff = compareText('Hello World', 'Hello World');
      expect(diff.kind).toBe('exact-match');
      expect(diff.equalRaw).toBe(true);
      expect(diff.equalNormalized).toBe(true);
      expect(diff.similarity).toBe(1);
    });

    test('empty strings', () => {
      const diff = compareText('', '');
      expect(diff.kind).toBe('exact-match');
      expect(diff.equalRaw).toBe(true);
      expect(diff.equalNormalized).toBe(true);
    });
  });

  describe('whitespace-or-case-only', () => {
    test('different leading/trailing whitespace', () => {
      const diff = compareText('Sign in', '  Sign in  ');
      expect(diff.kind).toBe('whitespace-or-case-only');
      expect(diff.equalRaw).toBe(false);
      expect(diff.equalNormalized).toBe(true);
    });

    test('different internal whitespace', () => {
      const diff = compareText('Sign in', 'Sign  in');
      expect(diff.kind).toBe('whitespace-or-case-only');
      expect(diff.equalRaw).toBe(false);
      expect(diff.equalNormalized).toBe(true);
    });

    test('case differences (case-insensitive mode)', () => {
      const diff = compareText('Email Address', 'email address', {
        caseSensitive: false,
      });
      expect(diff.kind).toBe('whitespace-or-case-only');
      expect(diff.equalRaw).toBe(false);
      expect(diff.equalNormalized).toBe(true);
    });

    test('NFKC normalization differences', () => {
      // Full-width vs half-width digits
      const diff = compareText('Test123', 'Test\uFF11\uFF12\uFF13'); // Full-width 123
      expect(diff.kind).toBe('whitespace-or-case-only');
      expect(diff.equalRaw).toBe(false);
      expect(diff.equalNormalized).toBe(true);
    });

    test('combined whitespace and case differences', () => {
      const diff = compareText('  Sign In  ', 'sign in', {
        caseSensitive: false,
      });
      expect(diff.kind).toBe('whitespace-or-case-only');
      expect(diff.equalRaw).toBe(false);
      expect(diff.equalNormalized).toBe(true);
    });
  });

  describe('normalized-match', () => {
    test('similar texts above threshold', () => {
      const diff = compareText('Email address', 'Email addres', {
        similarityThreshold: 0.5,
      });
      expect(diff.kind).toBe('normalized-match');
      expect(diff.equalNormalized).toBe(false);
      expect(diff.similarity).toBeGreaterThan(0.5);
    });

    test('moderate similarity detected', () => {
      const diff = compareText('Testing functionality', 'Testing functionalitty', {
        similarityThreshold: 0.5,
      });
      expect(diff.kind).toBe('normalized-match');
      expect(diff.similarity).toBeGreaterThan(0.5);
    });

    test('custom similarity threshold', () => {
      const diff = compareText('Hello World', 'Hello World!', {
        similarityThreshold: 0.5,
      });
      expect(diff.kind).toBe('normalized-match');
      expect(diff.similarity).toBeGreaterThan(0.5);
    });
  });

  describe('mismatch', () => {
    test('completely different texts', () => {
      const diff = compareText('Login', 'Register');
      expect(diff.kind).toBe('mismatch');
      expect(diff.equalRaw).toBe(false);
      expect(diff.equalNormalized).toBe(false);
      expect(diff.similarity).toBeLessThan(0.9);
    });

    test('empty vs non-empty', () => {
      const diff = compareText('', 'Some text');
      expect(diff.kind).toBe('mismatch');
      expect(diff.equalNormalized).toBe(false);
    });

    test('below similarity threshold', () => {
      const diff = compareText('Email address', 'Password field', {
        similarityThreshold: 0.9,
      });
      expect(diff.kind).toBe('mismatch');
      expect(diff.similarity).toBeLessThan(0.9);
    });
  });

  describe('case-sensitive mode', () => {
    test('case differences are detected', () => {
      const diff = compareText('Email', 'email', {
        caseSensitive: true,
      });
      expect(diff.equalRaw).toBe(false);
      expect(diff.equalNormalized).toBe(false);
      // In case-sensitive mode, normalization preserves case
      expect(diff.normalizedExpected).toBe('Email');
      expect(diff.normalizedActual).toBe('email');
      // Still similar in token content
      expect(diff.similarity).toBeGreaterThan(0.8);
    });
  });

  describe('normalized text output', () => {
    test('provides normalized versions', () => {
      const diff = compareText('  Sign In  ', 'SIGN IN', {
        caseSensitive: false,
      });
      expect(diff.normalizedExpected).toBe('sign in');
      expect(diff.normalizedActual).toBe('sign in');
    });

    test('preserves original texts', () => {
      const diff = compareText('  Original  ', '  Text  ');
      expect(diff.expected).toBe('  Original  ');
      expect(diff.actual).toBe('  Text  ');
    });
  });

  describe('similarity scoring', () => {
    test('exact match has similarity 1.0', () => {
      const diff = compareText('Test', 'Test');
      expect(diff.similarity).toBe(1);
    });

    test('partial match has intermediate similarity', () => {
      const diff = compareText('Testing', 'Test');
      expect(diff.similarity).toBeGreaterThan(0);
      expect(diff.similarity).toBeLessThan(1);
    });

    test('completely different has low similarity', () => {
      const diff = compareText('Apple', 'Orange');
      expect(diff.similarity).toBeLessThan(0.5);
    });
  });

  describe('edge cases', () => {
    test('handles special characters', () => {
      const diff = compareText('Hello@World!', 'Hello@World!');
      expect(diff.kind).toBe('exact-match');
    });

    test('handles unicode characters', () => {
      const diff = compareText('こんにちは', 'こんにちは');
      expect(diff.kind).toBe('exact-match');
    });
  });

  describe('real-world scenarios', () => {
    test('detects typo in longer text', () => {
      const diff = compareText('Submit the form', 'Submit teh form', {
        similarityThreshold: 0.5,
      });
      expect(diff.kind).toBe('normalized-match');
      expect(diff.similarity).toBeGreaterThan(0.5);
    });

    test('detects minor word differences', () => {
      const diff = compareText('User name field', 'User name label', {
        similarityThreshold: 0.5,
      });
      expect(diff.kind).toBe('normalized-match');
      expect(diff.similarity).toBeGreaterThan(0.5);
    });

    test('handles punctuation differences', () => {
      const diff = compareText('Hello, World!', 'Hello World', {
        similarityThreshold: 0.4,
      });
      expect(diff.kind).toBe('normalized-match');
      expect(diff.similarity).toBeGreaterThan(0.4);
    });

    test('detects translated text', () => {
      const diff = compareText('Sign in', 'サインイン');
      expect(diff.kind).toBe('mismatch');
      expect(diff.similarity).toBeLessThan(0.3);
    });
  });
});
