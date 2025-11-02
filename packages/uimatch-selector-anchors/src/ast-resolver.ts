import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import type { SelectorHint } from './schema.js';

/**
 * Result of resolving a selector from AST
 */
export interface ASTResolverResult {
  /**
   * Generated selector candidates in priority order
   */
  selectors: string[];

  /**
   * Extracted hint information from the code
   */
  hint: SelectorHint;

  /**
   * The actual JSX element found at the location
   */
  element?: {
    tag: string;
    attributes: Record<string, string>;
    text?: string;
  };
}

/**
 * Resolve selector from TypeScript/JSX source code
 *
 * @param file - Path to TypeScript/JSX file
 * @param line - Target line number (1-indexed)
 * @param col - Target column number (0-indexed)
 * @returns Resolver result with selector candidates
 */
export async function resolveFromTypeScript(
  file: string,
  line: number,
  col: number
): Promise<ASTResolverResult | null> {
  const absolutePath = resolve(file);
  const content = await readFile(absolutePath, 'utf-8');

  // Parse TypeScript/JSX
  const sourceFile = ts.createSourceFile(
    absolutePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    absolutePath.endsWith('.tsx') || absolutePath.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS
  );

  // Find node at position
  const position = getPositionFromLineCol(content, line, col);
  const targetNode = findNodeAtPosition(sourceFile, position);

  if (!targetNode) {
    return null;
  }

  // Find JSX element
  const jsxElement = findJsxElement(targetNode);
  if (!jsxElement) {
    return null;
  }

  // Extract attributes and generate selectors
  const attributes = extractJsxAttributes(jsxElement);
  const hint = buildHintFromAttributes(attributes);
  const selectors = generateSelectorsFromAttributes(attributes);

  return {
    selectors,
    hint,
    element: {
      tag: getJsxTagName(jsxElement),
      attributes,
      text: extractTextContent(jsxElement),
    },
  };
}

/**
 * Convert line/col to absolute position in file
 */
function getPositionFromLineCol(content: string, line: number, col: number): number {
  const lines = content.split('\n');
  let position = 0;

  for (let i = 0; i < line - 1; i++) {
    position += (lines[i]?.length ?? 0) + 1; // +1 for newline
  }

  position += col;
  return position;
}

/**
 * Find AST node at specific position
 */
function findNodeAtPosition(node: ts.Node, position: number): ts.Node | undefined {
  if (position < node.getStart() || position >= node.getEnd()) {
    return undefined;
  }

  // Check children
  const child = ts.forEachChild(node, (child) => {
    if (position >= child.getStart() && position < child.getEnd()) {
      return findNodeAtPosition(child, position);
    }
    return undefined;
  });

  return child ?? node;
}

/**
 * Find JSX element from a node (traverse up if needed)
 */
function findJsxElement(node: ts.Node): ts.JsxElement | ts.JsxSelfClosingElement | undefined {
  let current: ts.Node | undefined = node;

  while (current) {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      return current;
    }
    current = current.parent;
  }

  return undefined;
}

/**
 * Get JSX tag name
 */
function getJsxTagName(element: ts.JsxElement | ts.JsxSelfClosingElement): string {
  if (ts.isJsxElement(element)) {
    return element.openingElement.tagName.getText();
  }
  return element.tagName.getText();
}

/**
 * Extract attributes from JSX element
 */
function extractJsxAttributes(
  element: ts.JsxElement | ts.JsxSelfClosingElement
): Record<string, string> {
  const attributes: Record<string, string> = {};

  const jsxAttributes = ts.isJsxElement(element)
    ? element.openingElement.attributes
    : element.attributes;

  jsxAttributes.properties.forEach((prop) => {
    if (ts.isJsxAttribute(prop)) {
      const name = prop.name.getText();
      const value = prop.initializer;

      if (value && ts.isStringLiteral(value)) {
        attributes[name] = value.text;
      } else if (value && ts.isJsxExpression(value) && value.expression) {
        // Handle simple expressions like {true}, {"value"}
        const expr = value.expression;
        if (ts.isStringLiteral(expr)) {
          attributes[name] = expr.text;
        } else if (expr.kind === ts.SyntaxKind.TrueKeyword) {
          attributes[name] = 'true';
        } else if (expr.kind === ts.SyntaxKind.FalseKeyword) {
          attributes[name] = 'false';
        }
      } else if (!value) {
        // Boolean attribute without value (e.g., disabled)
        attributes[name] = 'true';
      }
    }
  });

  return attributes;
}

/**
 * Extract text content from JSX element
 */
function extractTextContent(element: ts.JsxElement | ts.JsxSelfClosingElement): string | undefined {
  if (!ts.isJsxElement(element)) {
    return undefined;
  }

  const texts: string[] = [];

  element.children.forEach((child) => {
    if (ts.isJsxText(child)) {
      const text = child.text.trim();
      if (text) {
        texts.push(text);
      }
    } else if (ts.isJsxExpression(child) && child.expression) {
      const expr = child.expression;
      if (ts.isStringLiteral(expr)) {
        texts.push(expr.text);
      }
    }
  });

  return texts.length > 0 ? texts.join(' ') : undefined;
}

/**
 * Build selector hint from attributes
 */
function buildHintFromAttributes(attributes: Record<string, string>): SelectorHint {
  const hint: SelectorHint = {};

  // Determine preferred strategies based on available attributes
  const prefer: Array<'testid' | 'role' | 'text' | 'css'> = [];

  if (attributes['data-testid']) {
    prefer.push('testid');
    hint.testid = attributes['data-testid'];
  }

  if (attributes['role']) {
    prefer.push('role');
    hint.role = attributes['role'];
  }

  if (attributes['aria-label']) {
    hint.ariaLabel = attributes['aria-label'];
  }

  if (prefer.length === 0) {
    // Fallback to CSS if no semantic attributes
    prefer.push('css');
  }

  hint.prefer = prefer;

  return hint;
}

/**
 * Generate selector candidates from attributes
 */
function generateSelectorsFromAttributes(attributes: Record<string, string>): string[] {
  const selectors: string[] = [];

  // Priority 1: data-testid
  if (attributes['data-testid']) {
    selectors.push(`[data-testid="${attributes['data-testid']}"]`);
  }

  // Priority 2: role with aria-label
  if (attributes['role']) {
    if (attributes['aria-label']) {
      selectors.push(`role:${attributes['role']}[name="${attributes['aria-label']}"]`);
    } else {
      selectors.push(`role:${attributes['role']}`);
    }
  }

  // Priority 3: id
  if (attributes['id']) {
    selectors.push(`#${attributes['id']}`);
  }

  // Priority 4: class (first class only for stability)
  if (attributes['className'] || attributes['class']) {
    const className = attributes['className'] || attributes['class'];
    const firstClass = className?.split(/\s+/)[0];
    if (firstClass) {
      selectors.push(`.${firstClass}`);
    }
  }

  return selectors;
}
