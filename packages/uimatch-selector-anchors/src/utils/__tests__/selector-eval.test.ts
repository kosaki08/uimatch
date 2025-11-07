/**
 * Tests for safe expression evaluation system
 * Focus on security: prototype pollution, ReDoS, injection attacks
 */

import { describe, expect, it } from 'bun:test';
import { ExpressionValidationError, safeEval, validateExpression } from '../selector-eval.js';

describe('safeEval - Basic Functionality', () => {
  it('should evaluate simple arithmetic expressions', () => {
    expect(safeEval('1 + 2')).toBe(3);
    expect(safeEval('10 - 5')).toBe(5);
    expect(safeEval('3 * 4')).toBe(12);
    expect(safeEval('15 / 3')).toBe(5);
    expect(safeEval('10 % 3')).toBe(1);
  });

  it('should evaluate expressions with variables', () => {
    expect(safeEval('x + y', { x: 10, y: 20 })).toBe(30);
    expect(safeEval('width > 100', { width: 150 })).toBe(true);
    expect(safeEval('width > 100', { width: 50 })).toBe(false);
  });

  it('should evaluate comparison operators', () => {
    expect(safeEval('5 === 5')).toBe(true);
    expect(safeEval('5 !== 3')).toBe(true);
    expect(safeEval('10 > 5')).toBe(true);
    expect(safeEval('3 < 8')).toBe(true);
    expect(safeEval('5 >= 5')).toBe(true);
    expect(safeEval('4 <= 10')).toBe(true);
  });

  it('should evaluate logical operators', () => {
    expect(safeEval('true && true')).toBe(true);
    expect(safeEval('true && false')).toBe(false);
    expect(safeEval('true || false')).toBe(true);
    expect(safeEval('!false')).toBe(true);
    expect(safeEval('!true')).toBe(false);
  });

  it('should evaluate conditional expressions', () => {
    expect(safeEval('true ? 1 : 2')).toBe(1);
    expect(safeEval('false ? 1 : 2')).toBe(2);
    expect(safeEval('x > 10 ? "big" : "small"', { x: 15 })).toBe('big');
  });

  it('should short-circuit logical operators', () => {
    // && should not evaluate right side if left is false
    expect(safeEval('false && x', { x: 1 })).toBe(false);

    // || should not evaluate right side if left is true
    expect(safeEval('true || x', { x: 1 })).toBe(true);
  });
});

describe('safeEval - Security: Prototype Pollution', () => {
  it('should block __proto__ access', () => {
    expect(() => safeEval('__proto__.polluted = 1')).toThrow(ExpressionValidationError);
    expect(() => safeEval('x.__proto__', { x: {} })).toThrow(ExpressionValidationError);
  });

  it('should block constructor access', () => {
    expect(() => safeEval('constructor.prototype')).toThrow(ExpressionValidationError);
    expect(() => safeEval('x.constructor', { x: {} })).toThrow(ExpressionValidationError);
  });

  it('should block prototype access', () => {
    expect(() => safeEval('Object.prototype')).toThrow(ExpressionValidationError);
    expect(() => safeEval('x.prototype', { x: {} })).toThrow(ExpressionValidationError);
  });

  it('should block getter/setter manipulation', () => {
    expect(() => safeEval('__defineGetter__("x", () => 1)')).toThrow(ExpressionValidationError);
    expect(() => safeEval('__defineSetter__("x", () => {})')).toThrow(ExpressionValidationError);
    expect(() => safeEval('__lookupGetter__("x")')).toThrow(ExpressionValidationError);
    expect(() => safeEval('__lookupSetter__("x")')).toThrow(ExpressionValidationError);
  });

  it('should prevent indirect prototype pollution', () => {
    const context = { obj: {} };

    // Direct attempt
    expect(() => safeEval('obj.__proto__.polluted = 1', context)).toThrow(
      ExpressionValidationError
    );

    // Verify no pollution occurred
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

describe('safeEval - Security: ReDoS (Regular expression Denial of Service)', () => {
  it('should block catastrophic backtracking patterns', () => {
    // (a+)+ pattern
    expect(() => safeEval('(a+)+')).toThrow(ExpressionValidationError);

    // (a*)* pattern
    expect(() => safeEval('(a*)*')).toThrow(ExpressionValidationError);

    // (a+)+$ pattern
    expect(() => safeEval('(a+)+$')).toThrow(ExpressionValidationError);
  });

  it('should block alternation with quantifiers', () => {
    expect(() => safeEval('(a|b)+$')).toThrow(ExpressionValidationError);
  });
});

describe('safeEval - Security: Input Length Limits', () => {
  it('should reject extremely long inputs', () => {
    // Generate expression longer than MAX_INPUT_LENGTH (1000 chars)
    const longExpression = 'x'.repeat(1001);

    expect(() => safeEval(longExpression, { x: 1 })).toThrow(ExpressionValidationError);
  });

  it('should accept inputs within limit', () => {
    // Generate expression at the limit (1000 chars)
    // Use fewer variables to avoid depth limit (10 variables, 30 chars = ~300 chars)
    const ctx: Record<string, number> = {};
    const parts: string[] = [];

    for (let i = 0; i < 10; i++) {
      ctx[`x${i}`] = i;
      parts.push(`x${i}`);
    }

    const expression = parts.join(' + ');
    expect(expression.length).toBeLessThan(1000);

    // Should not throw
    expect(() => safeEval(expression, ctx)).not.toThrow();
  });
});

describe('safeEval - Security: Expression Complexity Limits', () => {
  it('should reject deeply nested expressions', () => {
    // Build expression with depth > MAX_EXPRESSION_DEPTH (20)
    let expression = 'x';
    for (let i = 0; i < 25; i++) {
      expression = `(${expression} + 1)`;
    }

    expect(() => safeEval(expression, { x: 1 })).toThrow(ExpressionValidationError);
  });

  it('should accept moderately complex expressions', () => {
    // Build expression within depth limit
    let expression = 'x';
    for (let i = 0; i < 10; i++) {
      expression = `(${expression} + 1)`;
    }

    expect(() => safeEval(expression, { x: 1 })).not.toThrow();
  });
});

describe('safeEval - Security: Operator Whitelist', () => {
  it('should block assignment operators', () => {
    expect(() => safeEval('x = 1', { x: 0 })).toThrow(ExpressionValidationError);
    expect(() => safeEval('x += 1', { x: 0 })).toThrow(ExpressionValidationError);
    expect(() => safeEval('x -= 1', { x: 0 })).toThrow(ExpressionValidationError);
  });

  it('should block bitwise operators', () => {
    expect(() => safeEval('5 & 3')).toThrow(ExpressionValidationError);
    expect(() => safeEval('5 | 3')).toThrow(ExpressionValidationError);
    expect(() => safeEval('5 ^ 3')).toThrow(ExpressionValidationError);
    expect(() => safeEval('5 << 1')).toThrow(ExpressionValidationError);
    expect(() => safeEval('5 >> 1')).toThrow(ExpressionValidationError);
  });

  it('should block in operator', () => {
    expect(() => safeEval('"x" in obj', { obj: { x: 1 } })).toThrow(ExpressionValidationError);
  });

  it('should block instanceof operator', () => {
    expect(() => safeEval('obj instanceof Object', { obj: {} })).toThrow(ExpressionValidationError);
  });
});

describe('safeEval - Security: Member Access Restrictions', () => {
  it('should block arbitrary member access', () => {
    const context = {
      user: {
        name: 'Alice',
        password: 'secret',
      },
    };

    // password access should be blocked (not in whitelist)
    expect(() => safeEval('user.password', context)).toThrow(ExpressionValidationError);
  });

  it('should allow whitelisted member access', () => {
    expect(safeEval('"hello".length')).toBe(5);
    expect(safeEval('"HELLO".toLowerCase()')).toBe('hello');
    expect(safeEval('"  test  ".trim()')).toBe('test');
  });

  it('should block computed property access', () => {
    const context = {
      obj: { key: 'value' },
      prop: 'key',
    };

    // obj[prop] should be blocked
    expect(() => safeEval('obj[prop]', context)).toThrow(ExpressionValidationError);
  });
});

describe('safeEval - Security: Function Call Restrictions', () => {
  it('should block non-whitelisted function calls', () => {
    expect(() => safeEval('eval("1 + 1")')).toThrow(ExpressionValidationError);
    expect(() => safeEval('Function("return 1")()')).toThrow(ExpressionValidationError);
  });

  it('should allow whitelisted Math functions', () => {
    expect(safeEval('Math.abs(-5)')).toBe(5);
    expect(safeEval('Math.max(1, 5, 3)')).toBe(5);
    expect(safeEval('Math.min(1, 5, 3)')).toBe(1);
    expect(safeEval('Math.round(3.7)')).toBe(4);
  });

  it('should block setTimeout/setInterval', () => {
    expect(() => safeEval('setTimeout(() => {}, 0)')).toThrow(ExpressionValidationError);
    expect(() => safeEval('setInterval(() => {}, 0)')).toThrow(ExpressionValidationError);
  });
});

describe('safeEval - Security: Context Isolation', () => {
  it('should not allow access to global objects', () => {
    expect(() => safeEval('global')).toThrow(ExpressionValidationError);
    expect(() => safeEval('window')).toThrow(ExpressionValidationError);
    expect(() => safeEval('process')).toThrow(ExpressionValidationError);
  });

  it('should only access provided context variables', () => {
    const context = { x: 10 };

    // Access to x should work
    expect(safeEval('x', context)).toBe(10);

    // Access to undefined variable should throw
    expect(() => safeEval('y', context)).toThrow(ExpressionValidationError);
  });

  it('should not leak context between evaluations', () => {
    const context1 = { x: 1 };
    const context2 = { y: 2 };

    safeEval('x + 1', context1);

    // context2 should not have access to x from context1
    expect(() => safeEval('x', context2)).toThrow(ExpressionValidationError);
  });
});

describe('safeEval - Error Handling', () => {
  it('should throw ExpressionValidationError for invalid syntax', () => {
    expect(() => safeEval('x +')).toThrow(ExpressionValidationError);
    expect(() => safeEval('(x')).toThrow(ExpressionValidationError);
  });

  it('should provide error details', () => {
    try {
      safeEval('__proto__.x = 1');
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionValidationError);
      expect((error as ExpressionValidationError).message).toContain('__proto__');
    }
  });
});

describe('validateExpression', () => {
  it('should validate safe expressions', () => {
    expect(validateExpression('x + y')).toBe(true);
    expect(validateExpression('width > 100 && height < 200')).toBe(true);
    expect(validateExpression('Math.abs(-5)')).toBe(true);
  });

  it('should reject unsafe expressions', () => {
    expect(validateExpression('__proto__.x = 1')).toBe(false);
    expect(validateExpression('constructor.prototype')).toBe(false);
    expect(validateExpression('x'.repeat(1001))).toBe(false);
    expect(validateExpression('(a+)+')).toBe(false);
  });

  it('should reject syntactically invalid expressions', () => {
    expect(validateExpression('x +')).toBe(false);
    expect(validateExpression('(x')).toBe(false);
  });
});

describe('safeEval - Real-world Use Cases', () => {
  it('should evaluate selector conditions', () => {
    const context = {
      width: 1920,
      height: 1080,
      visible: true,
      disabled: false,
    };

    expect(safeEval('width > 1024 && height > 768', context)).toBe(true);
    expect(safeEval('visible && !disabled', context)).toBe(true);
  });

  it('should evaluate string matching conditions', () => {
    const context = {
      text: 'Hello World',
    };

    expect(safeEval('"Hello World".length === 11')).toBe(true);
    expect(safeEval('"Hello".toLowerCase() === "hello"')).toBe(true);
  });

  it('should evaluate numeric calculations', () => {
    const context = {
      baseWidth: 100,
      scale: 1.5,
      padding: 20,
    };

    expect(safeEval('baseWidth * scale + padding * 2', context)).toBe(190);
  });
});
