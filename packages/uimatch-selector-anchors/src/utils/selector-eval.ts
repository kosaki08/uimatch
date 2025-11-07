/**
 * Safe evaluation system for dynamic selector expressions
 *
 * This module centralizes all dynamic evaluation to control attack surface.
 * Uses whitelist-based validation and AST parsing instead of eval/Function.
 *
 * Security constraints:
 * - Only allow mathematical operators (+, -, *, /, %)
 * - Only allow comparison operators (===, !==, <, >, <=, >=)
 * - Only allow logical operators (&&, ||, !)
 * - Only allow safe built-in functions (Math.*, String.prototype.*, Array.prototype.*)
 * - No property access on user-controlled objects
 * - No constructor/prototype access
 * - Length limits on input strings
 * - Complexity limits on expressions
 */

import type {
  ArrayExpression,
  BinaryExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  Identifier,
  Literal,
  MemberExpression,
  UnaryExpression,
} from 'jsep';
import jsep from 'jsep';

/**
 * Maximum input length to prevent DoS attacks
 */
const MAX_INPUT_LENGTH = 1000;

/**
 * Maximum expression depth to prevent stack overflow
 */
const MAX_EXPRESSION_DEPTH = 20;

/**
 * Allowed operators (whitelist)
 */
const ALLOWED_OPERATORS = new Set([
  // Arithmetic
  '+',
  '-',
  '*',
  '/',
  '%',
  // Comparison
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  // Logical
  '&&',
  '||',
  '!',
]);

/**
 * Allowed unary operators
 */
const ALLOWED_UNARY_OPERATORS = new Set(['-', '+', '!']);

/**
 * Allowed member access patterns (whitelist)
 */
const ALLOWED_MEMBERS = new Set([
  // Math functions
  'Math.abs',
  'Math.ceil',
  'Math.floor',
  'Math.round',
  'Math.min',
  'Math.max',
  // String methods (safe subset)
  'length',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'includes',
  'startsWith',
  'endsWith',
  // Array methods (safe subset)
  'length',
  'includes',
  'some',
  'every',
]);

/**
 * Error thrown when expression validation fails
 */
export class ExpressionValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ExpressionValidationError';
  }
}

/**
 * Context for safe expression evaluation
 */
export interface SafeEvalContext {
  // Variables available in the evaluation context
  [key: string]: unknown;
}

/**
 * Validate input length
 */
function validateLength(input: string): void {
  if (input.length > MAX_INPUT_LENGTH) {
    throw new ExpressionValidationError(
      `Input too long: ${input.length} chars (max: ${MAX_INPUT_LENGTH})`
    );
  }
}

/**
 * Detect potential prototype pollution attempts
 */
function detectPrototypePollution(input: string): void {
  const dangerous = [
    '__proto__',
    'constructor',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
  ];

  for (const pattern of dangerous) {
    if (input.includes(pattern)) {
      throw new ExpressionValidationError(`Dangerous pattern detected: ${pattern}`);
    }
  }
}

/**
 * Detect ReDoS (Regular expression Denial of Service) patterns
 */
function detectReDoS(input: string): void {
  // Check for catastrophic backtracking patterns in the input itself
  // These patterns indicate the input is trying to create a malicious regex
  const redosPatterns = [
    /\(\\w\+\\+\)\+/, // Literal: (\w++)+
    /\(\\w\*\\\*\)\+/, // Literal: (\w**)+
    /\(\\w\+\)\+\\\$/, // Literal: (\w+)+$
    /\(\\w\|\\s\)\+\$/, // Literal: (\w|\s)+$
  ];

  for (const pattern of redosPatterns) {
    if (pattern.test(input)) {
      throw new ExpressionValidationError('Potential ReDoS pattern detected');
    }
  }
}

/**
 * Validate AST node recursively
 */
function validateASTNode(node: Expression, depth = 0): void {
  if (depth > MAX_EXPRESSION_DEPTH) {
    throw new ExpressionValidationError(
      `Expression too deep: ${depth} (max: ${MAX_EXPRESSION_DEPTH})`
    );
  }

  switch (node.type) {
    case 'Literal':
      // Literals are safe
      return;

    case 'Identifier':
      // Identifiers are safe (validated against context)
      return;

    case 'BinaryExpression': {
      const binaryNode = node as BinaryExpression;
      if (!ALLOWED_OPERATORS.has(binaryNode.operator)) {
        throw new ExpressionValidationError(`Operator not allowed: ${binaryNode.operator}`);
      }
      validateASTNode(binaryNode.left, depth + 1);
      validateASTNode(binaryNode.right, depth + 1);
      return;
    }

    case 'UnaryExpression': {
      const unaryNode = node as UnaryExpression;
      if (!ALLOWED_UNARY_OPERATORS.has(unaryNode.operator)) {
        throw new ExpressionValidationError(`Unary operator not allowed: ${unaryNode.operator}`);
      }
      validateASTNode(unaryNode.argument, depth + 1);
      return;
    }

    case 'MemberExpression': {
      const memberNode = node as MemberExpression;
      // Only allow specific whitelisted member access
      const memberPath = buildMemberPath(memberNode);

      // Allow safe property access on literals (e.g., "hello".length)
      if (memberNode.object.type === 'Literal') {
        const property = !memberNode.computed ? (memberNode.property as Identifier).name : null;

        // Only allow whitelisted properties on literals
        if (property && ALLOWED_MEMBERS.has(property)) {
          return;
        }
      }

      // Check full path whitelist
      if (!ALLOWED_MEMBERS.has(memberPath)) {
        throw new ExpressionValidationError(`Member access not allowed: ${memberPath}`);
      }
      return;
    }

    case 'CallExpression': {
      const callNode = node as CallExpression;
      const fnPath = buildMemberPath(callNode.callee);

      // Allow safe method calls on literals (e.g., "hello".toLowerCase())
      if (callNode.callee.type === 'MemberExpression') {
        const memberExpr = callNode.callee as MemberExpression;
        if (memberExpr.object.type === 'Literal') {
          const method = !memberExpr.computed ? (memberExpr.property as Identifier).name : null;

          // Only allow whitelisted methods on literals
          if (method && ALLOWED_MEMBERS.has(method)) {
            // Validate arguments
            for (const arg of callNode.arguments) {
              validateASTNode(arg, depth + 1);
            }
            return;
          }
        }
      }

      // Check full path whitelist
      if (!ALLOWED_MEMBERS.has(fnPath)) {
        throw new ExpressionValidationError(`Function call not allowed: ${fnPath}`);
      }

      // Validate arguments
      for (const arg of callNode.arguments) {
        validateASTNode(arg, depth + 1);
      }
      return;
    }

    case 'ConditionalExpression': {
      const condNode = node as ConditionalExpression;
      validateASTNode(condNode.test, depth + 1);
      validateASTNode(condNode.consequent, depth + 1);
      validateASTNode(condNode.alternate, depth + 1);
      return;
    }

    case 'ArrayExpression': {
      const arrayNode = node as ArrayExpression;
      for (const element of arrayNode.elements) {
        if (element !== null) {
          validateASTNode(element, depth + 1);
        }
      }
      return;
    }

    default:
      throw new ExpressionValidationError(`AST node type not allowed: ${node.type}`);
  }
}

/**
 * Build member path from AST node (e.g., "Math.abs", "str.length")
 */
function buildMemberPath(node: Expression): string {
  if (node.type === 'Identifier') {
    return (node as Identifier).name;
  }

  if (node.type === 'Literal') {
    const literalValue = (node as Literal).value;
    return typeof literalValue === 'string' ? `"${literalValue}"` : String(literalValue);
  }

  if (node.type === 'MemberExpression') {
    const memberNode = node as MemberExpression;
    const object = buildMemberPath(memberNode.object);
    const property = memberNode.computed
      ? '[computed]' // Disallow computed access
      : (memberNode.property as Identifier).name;
    return `${object}.${property}`;
  }

  return '[unknown]';
}

/**
 * Safe global context with whitelisted built-ins
 */
const SAFE_GLOBALS: SafeEvalContext = {
  Math: Math,
  // Add other safe globals here as needed
};

/**
 * Interpret AST node (safe evaluation)
 */
function interpretASTNode(node: Expression, context: SafeEvalContext): unknown {
  switch (node.type) {
    case 'Literal':
      return (node as Literal).value;

    case 'Identifier': {
      const id = (node as Identifier).name;

      // Check user context first
      if (id in context) {
        return context[id];
      }

      // Then check safe globals
      if (id in SAFE_GLOBALS) {
        return SAFE_GLOBALS[id];
      }

      throw new ExpressionValidationError(`Identifier not in context: ${id}`);
    }

    case 'BinaryExpression': {
      const binaryNode = node as BinaryExpression;

      // Handle logical operators with short-circuit evaluation
      if (binaryNode.operator === '&&' || binaryNode.operator === '||') {
        const left = interpretASTNode(binaryNode.left, context);

        if (binaryNode.operator === '&&') {
          return left ? interpretASTNode(binaryNode.right, context) : left;
        } else {
          // ||
          return left ? left : interpretASTNode(binaryNode.right, context);
        }
      }

      // Evaluate both sides for other binary operators
      const left = interpretASTNode(binaryNode.left, context);
      const right = interpretASTNode(binaryNode.right, context);

      switch (binaryNode.operator) {
        case '+':
          return (left as number) + (right as number);
        case '-':
          return (left as number) - (right as number);
        case '*':
          return (left as number) * (right as number);
        case '/':
          return (left as number) / (right as number);
        case '%':
          return (left as number) % (right as number);
        case '===':
          return left === right;
        case '!==':
          return left !== right;
        case '==':
          return left == right;
        case '!=':
          return left != right;
        case '<':
          return (left as number) < (right as number);
        case '>':
          return (left as number) > (right as number);
        case '<=':
          return (left as number) <= (right as number);
        case '>=':
          return (left as number) >= (right as number);
        default:
          throw new ExpressionValidationError(`Operator not implemented: ${binaryNode.operator}`);
      }
    }

    case 'UnaryExpression': {
      const unaryNode = node as UnaryExpression;
      const argument = interpretASTNode(unaryNode.argument, context);

      switch (unaryNode.operator) {
        case '-':
          return -(argument as number);
        case '+':
          return +(argument as number);
        case '!':
          return !argument;
        default:
          throw new ExpressionValidationError(
            `Unary operator not implemented: ${unaryNode.operator}`
          );
      }
    }

    case 'ConditionalExpression': {
      const condNode = node as ConditionalExpression;
      const test = interpretASTNode(condNode.test, context);
      return test
        ? interpretASTNode(condNode.consequent, context)
        : interpretASTNode(condNode.alternate, context);
    }

    case 'MemberExpression': {
      const memberNode = node as MemberExpression;
      const object = interpretASTNode(memberNode.object, context);
      const property = memberNode.computed
        ? interpretASTNode(memberNode.property, context)
        : (memberNode.property as Identifier).name;

      // Safe member access - allow properties on any value type
      if (object != null && typeof property === 'string' && property in Object(object)) {
        const value = (object as Record<string, unknown>)[property];

        // If it's a method, bind it to the object
        if (typeof value === 'function') {
          return value.bind(object);
        }

        return value;
      }

      throw new ExpressionValidationError(`Member access failed: ${buildMemberPath(memberNode)}`);
    }

    case 'CallExpression': {
      const callNode = node as CallExpression;
      const fn = interpretASTNode(callNode.callee, context);
      const args = callNode.arguments.map((arg) => interpretASTNode(arg, context));

      if (typeof fn !== 'function') {
        throw new ExpressionValidationError(`Not a function: ${buildMemberPath(callNode.callee)}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      return fn(...args);
    }

    case 'ArrayExpression': {
      const arrayNode = node as ArrayExpression;
      return arrayNode.elements.map((element) =>
        element !== null ? interpretASTNode(element, context) : null
      );
    }

    default:
      throw new ExpressionValidationError(`AST node type not implemented: ${node.type}`);
  }
}

/**
 * Safely evaluate expression using AST parsing
 *
 * @param expression - Expression to evaluate (e.g., "width > 100 && height < 200")
 * @param context - Variables available in the expression
 * @returns Evaluation result
 * @throws ExpressionValidationError if expression is unsafe or invalid
 *
 * @example
 * ```ts
 * safeEval('width > 100', { width: 150 }) // Returns: true
 * safeEval('x + y * 2', { x: 10, y: 5 }) // Returns: 20
 * safeEval('__proto__.polluted = 1', {}) // Throws: ExpressionValidationError
 * ```
 */
export function safeEval(expression: string, context: SafeEvalContext = {}): unknown {
  // Input validation
  validateLength(expression);
  detectPrototypePollution(expression);
  detectReDoS(expression);

  try {
    // Parse expression to AST
    const ast = jsep(expression);

    // Validate AST structure
    validateASTNode(ast);

    // Interpret AST with safe context
    return interpretASTNode(ast, context);
  } catch (error) {
    if (error instanceof ExpressionValidationError) {
      throw error;
    }

    // Wrap jsep parsing errors
    throw new ExpressionValidationError('Expression parsing failed', error);
  }
}

/**
 * Validate expression without evaluating it
 *
 * @param expression - Expression to validate
 * @returns true if valid, false otherwise
 */
export function validateExpression(expression: string): boolean {
  try {
    validateLength(expression);
    detectPrototypePollution(expression);
    detectReDoS(expression);

    const ast = jsep(expression);
    validateASTNode(ast);

    return true;
  } catch {
    return false;
  }
}
