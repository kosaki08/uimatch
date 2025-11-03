import { describe, expect, it } from 'bun:test';
import { compileSafeRegex } from './safe-regex.js';

describe('compileSafeRegex', () => {
  describe('valid patterns', () => {
    it('should compile simple patterns successfully', () => {
      const result = compileSafeRegex('hello');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('hello world')).toBe(true);
        expect(result.regex.test('goodbye')).toBe(false);
      }
    });

    it('should compile patterns with character classes', () => {
      const result = compileSafeRegex('[a-z]+', 'i');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('ABC')).toBe(true);
        expect(result.regex.test('123')).toBe(false);
      }
    });

    it('should compile patterns with quantifiers', () => {
      const result = compileSafeRegex('a{1,3}');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('aa')).toBe(true);
        expect(result.regex.test('aaaa')).toBe(true);
      }
    });

    it('should handle capturing groups', () => {
      const result = compileSafeRegex('data-testid="([^"]+)"');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = 'data-testid="my-test-id"'.match(result.regex);
        expect(match?.[1]).toBe('my-test-id');
      }
    });

    it('should handle word boundaries', () => {
      const result = compileSafeRegex('\\bid\\b');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('id="test"')).toBe(true);
        expect(result.regex.test('valid')).toBe(false);
      }
    });
  });

  describe('length validation', () => {
    it('should reject patterns exceeding maximum length', () => {
      const longPattern = 'a'.repeat(501);
      const result = compileSafeRegex(longPattern);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('too long');
        expect(result.fallbackToLiteral).toBe(true);
      }
    });

    it('should accept patterns at the maximum length boundary', () => {
      const maxLengthPattern = 'a'.repeat(500);
      const result = compileSafeRegex(maxLengthPattern);
      expect(result.success).toBe(true);
    });
  });

  describe('dangerous nesting detection', () => {
    it('should reject patterns with deep nested quantifiers', () => {
      const dangerousPattern = '(((((.*)*)*)*)*)';
      const result = compileSafeRegex(dangerousPattern);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('dangerous');
        expect(result.fallbackToLiteral).toBe(true);
      }
    });

    it('should accept reasonable nesting levels', () => {
      const safePattern = '(a(b(c)))';
      const result = compileSafeRegex(safePattern);
      expect(result.success).toBe(true);
    });
  });

  describe('syntax error handling', () => {
    it('should handle invalid regex syntax gracefully', () => {
      const invalidPattern = '([unclosed';
      const result = compileSafeRegex(invalidPattern);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid regex syntax');
        expect(result.fallbackToLiteral).toBe(true);
      }
    });

    it('should handle invalid quantifier syntax', () => {
      const invalidPattern = 'a{5,2}'; // max < min
      const result = compileSafeRegex(invalidPattern);
      // Some regex engines may accept this, some may reject it
      // Just verify we handle it without throwing
      expect(result).toBeDefined();
    });

    it('should handle invalid escape sequences', () => {
      const invalidPattern = '\\k';
      const result = compileSafeRegex(invalidPattern);
      // May succeed or fail depending on JS engine, but should not throw
      expect(result).toBeDefined();
    });
  });

  describe('flags support', () => {
    it('should support case-insensitive flag', () => {
      const result = compileSafeRegex('hello', 'i');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('HELLO')).toBe(true);
        expect(result.regex.test('HeLLo')).toBe(true);
      }
    });

    it('should support global flag', () => {
      const result = compileSafeRegex('a', 'g');
      expect(result.success).toBe(true);
      if (result.success) {
        const matches = 'aaa'.match(result.regex);
        expect(matches).toHaveLength(3);
      }
    });

    it('should support multiline flag', () => {
      const result = compileSafeRegex('^test', 'm');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('line1\ntest')).toBe(true);
      }
    });

    it('should support combined flags', () => {
      const result = compileSafeRegex('test', 'gi');
      expect(result.success).toBe(true);
      if (result.success) {
        const matches = 'Test TEST test'.match(result.regex);
        expect(matches).toHaveLength(3);
      }
    });
  });

  describe('real-world patterns from heuristic candidates', () => {
    it('should handle data-testid extraction pattern', () => {
      const result = compileSafeRegex('data-testid=["\'](([^"\'])+)["\']');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = 'data-testid="submit-button"'.match(result.regex);
        expect(match?.[1]).toBe('submit-button');
      }
    });

    it('should handle id extraction pattern', () => {
      const result = compileSafeRegex('\\bid=["\'](([^"\'])+)["\']');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = 'id="main-content"'.match(result.regex);
        expect(match?.[1]).toBe('main-content');
      }
    });

    it('should handle role extraction pattern', () => {
      const result = compileSafeRegex('\\brole=["\'](([^"\'])+)["\']');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = 'role="button"'.match(result.regex);
        expect(match?.[1]).toBe('button');
      }
    });

    it('should handle text content extraction pattern', () => {
      const result = compileSafeRegex('>([^<]{1,24})<');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = '<button>Click me</button>'.match(result.regex);
        expect(match?.[1]).toBe('Click me');
      }
    });

    it('should handle tag name extraction pattern', () => {
      const result = compileSafeRegex('<(\\w+)\\b');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = '<button class="primary">'.match(result.regex);
        expect(match?.[1]).toBe('button');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty pattern', () => {
      const result = compileSafeRegex('');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('anything')).toBe(true);
      }
    });

    it('should handle pattern with only quantifiers', () => {
      const result = compileSafeRegex('*');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid regex syntax');
      }
    });

    it('should handle unicode patterns', () => {
      const result = compileSafeRegex('[\\u4E00-\\u9FFF]+');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('你好')).toBe(true);
        expect(result.regex.test('hello')).toBe(false);
      }
    });

    it('should handle no flags parameter', () => {
      const result = compileSafeRegex('test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.flags).toBe('');
      }
    });
  });
});
