import { describe, expect, it } from 'bun:test';
import { compileSafeRegex } from './safe-regex.js';

describe('compileSafeRegex', () => {
  describe('valid patterns', () => {
    it('should compile simple patterns successfully', async () => {
      const result = await compileSafeRegex('hello');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('hello world')).toBe(true);
        expect(result.regex.test('goodbye')).toBe(false);
      }
    });

    it('should compile patterns with character classes', async () => {
      const result = await compileSafeRegex('[a-z]+', 'i');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('ABC')).toBe(true);
        expect(result.regex.test('123')).toBe(false);
      }
    });

    it('should compile patterns with quantifiers', async () => {
      const result = await compileSafeRegex('a{1,3}');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('aa')).toBe(true);
        expect(result.regex.test('aaaa')).toBe(true);
      }
    });

    it('should handle capturing groups', async () => {
      const result = await compileSafeRegex('data-testid="([^"]+)"');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = 'data-testid="my-test-id"'.match(result.regex);
        expect(match?.[1]).toBe('my-test-id');
      }
    });

    it('should handle word boundaries', async () => {
      const result = await compileSafeRegex('\\bid\\b');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('id="test"')).toBe(true);
        expect(result.regex.test('valid')).toBe(false);
      }
    });
  });

  describe('length validation', () => {
    it('should reject patterns exceeding maximum length', async () => {
      const longPattern = 'a'.repeat(501);
      const result = await compileSafeRegex(longPattern);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('too long');
        expect(result.fallbackToLiteral).toBe(true);
      }
    });

    it('should accept patterns at the maximum length boundary', async () => {
      const maxLengthPattern = 'a'.repeat(500);
      const result = await compileSafeRegex(maxLengthPattern);
      expect(result.success).toBe(true);
    });
  });

  describe('dangerous nesting detection', () => {
    it('should reject patterns with deep nested quantifiers', async () => {
      const dangerousPattern = '(((((.*)*)*)*)*)';
      const result = await compileSafeRegex(dangerousPattern);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('dangerous');
        expect(result.fallbackToLiteral).toBe(true);
      }
    });

    it('should accept reasonable nesting levels', async () => {
      const safePattern = '(a(b(c)))';
      const result = await compileSafeRegex(safePattern);
      expect(result.success).toBe(true);
    });
  });

  describe('syntax error handling', () => {
    it('should handle invalid regex syntax gracefully', async () => {
      const invalidPattern = '([unclosed';
      const result = await compileSafeRegex(invalidPattern);
      expect(result.success).toBe(false);
      if (!result.success) {
        // safe-regex2 catches this as dangerous pattern before syntax check
        expect(result.error).toBeDefined();
        expect(result.fallbackToLiteral).toBe(true);
      }
    });

    it('should handle invalid quantifier syntax', async () => {
      const invalidPattern = 'a{5,2}'; // max < min
      const result = await compileSafeRegex(invalidPattern);
      // Some regex engines may accept this, some may reject it
      // Just verify we handle it without throwing
      expect(result).toBeDefined();
    });

    it('should handle invalid escape sequences', async () => {
      const invalidPattern = '\\k';
      const result = await compileSafeRegex(invalidPattern);
      // May succeed or fail depending on JS engine, but should not throw
      expect(result).toBeDefined();
    });
  });

  describe('flags support', () => {
    it('should support case-insensitive flag', async () => {
      const result = await compileSafeRegex('hello', 'i');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('HELLO')).toBe(true);
        expect(result.regex.test('HeLLo')).toBe(true);
      }
    });

    it('should support global flag', async () => {
      const result = await compileSafeRegex('a', 'g');
      expect(result.success).toBe(true);
      if (result.success) {
        const matches = 'aaa'.match(result.regex);
        expect(matches).toHaveLength(3);
      }
    });

    it('should support multiline flag', async () => {
      const result = await compileSafeRegex('^test', 'm');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('line1\ntest')).toBe(true);
      }
    });

    it('should support combined flags', async () => {
      const result = await compileSafeRegex('test', 'gi');
      expect(result.success).toBe(true);
      if (result.success) {
        const matches = 'Test TEST test'.match(result.regex);
        expect(matches).toHaveLength(3);
      }
    });
  });

  describe('real-world patterns from heuristic candidates', () => {
    it('should handle data-testid extraction pattern', async () => {
      const result = await compileSafeRegex('data-testid=["\'](([^"\'])+)["\']');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = 'data-testid="submit-button"'.match(result.regex);
        expect(match?.[1]).toBe('submit-button');
      }
    });

    it('should handle id extraction pattern', async () => {
      const result = await compileSafeRegex('\\bid=["\'](([^"\'])+)["\']');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = 'id="main-content"'.match(result.regex);
        expect(match?.[1]).toBe('main-content');
      }
    });

    it('should handle role extraction pattern', async () => {
      const result = await compileSafeRegex('\\brole=["\'](([^"\'])+)["\']');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = 'role="button"'.match(result.regex);
        expect(match?.[1]).toBe('button');
      }
    });

    it('should handle text content extraction pattern', async () => {
      const result = await compileSafeRegex('>([^<]{1,24})<');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = '<button>Click me</button>'.match(result.regex);
        expect(match?.[1]).toBe('Click me');
      }
    });

    it('should handle tag name extraction pattern', async () => {
      const result = await compileSafeRegex('<(\\w+)\\b');
      expect(result.success).toBe(true);
      if (result.success) {
        const match = '<button class="primary">'.match(result.regex);
        expect(match?.[1]).toBe('button');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty pattern', async () => {
      const result = await compileSafeRegex('');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('anything')).toBe(true);
      }
    });

    it('should handle pattern with only quantifiers', async () => {
      const result = await compileSafeRegex('*');
      expect(result.success).toBe(false);
      if (!result.success) {
        // safe-regex2 catches this as dangerous pattern
        expect(result.error).toBeDefined();
      }
    });

    it('should handle unicode patterns', async () => {
      const result = await compileSafeRegex('[\\u4E00-\\u9FFF]+');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.test('你好')).toBe(true);
        expect(result.regex.test('hello')).toBe(false);
      }
    });

    it('should handle no flags parameter', async () => {
      const result = await compileSafeRegex('test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.regex.flags).toBe('');
      }
    });
  });
});
