import type { SelectorHint } from '#anchors/types/schema';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

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
    tag?: string;
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

  // Import fallback utilities
  const { fastPathParse, attributeOnlyParse, heuristicCandidates, withTimeout } = await import(
    './ast-fallback.js'
  );

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

  // Tiered fallback strategy:
  // 1. Try fast path (300ms) - tag, data-testid, id only
  // 2. Try attribute-only (600ms) - all attributes, no text
  // 3. Try full parse (900ms) - everything including text
  // 4. Fallback to heuristics - regex-based extraction

  const reasons: string[] = [];

  // Level 1: Fast path
  const fastResult = await withTimeout(Promise.resolve(fastPathParse(jsxElement)), 300);

  if (fastResult && fastResult.selectors.length > 0) {
    reasons.push('Fast path succeeded (< 300ms)');
    reasons.push(...fastResult.reasons);

    return {
      selectors: fastResult.selectors,
      hint: fastResult.hint,
      element: fastResult.element,
    };
  }

  reasons.push('Fast path incomplete or timed out, trying attribute-only');

  // Level 2: Attribute-only
  const attrResult = await withTimeout(Promise.resolve(attributeOnlyParse(jsxElement)), 600);

  if (attrResult && attrResult.selectors.length > 0) {
    reasons.push('Attribute-only succeeded (< 600ms)');
    reasons.push(...attrResult.reasons);

    return {
      selectors: attrResult.selectors,
      hint: attrResult.hint,
      element: attrResult.element,
    };
  }

  reasons.push('Attribute-only incomplete or timed out, trying full parse');

  // Level 3: Full parse (original implementation)
  const fullParseResult = await withTimeout(
    Promise.resolve(
      (() => {
        try {
          // Extract attributes and text content
          const attributes = extractJsxAttributes(jsxElement);
          const elementText = extractTextContent(jsxElement);

          const hint = buildHintFromAttributes(attributes, elementText);
          const selectors = generateSelectorsFromAttributes(attributes, elementText);

          return {
            selectors,
            hint,
            element: {
              tag: getJsxTagName(jsxElement),
              attributes,
              text: elementText,
            },
          };
        } catch {
          return null;
        }
      })()
    ),
    900
  );

  if (fullParseResult && fullParseResult.selectors.length > 0) {
    reasons.push('Full parse succeeded (< 900ms)');
    return fullParseResult;
  }

  reasons.push('Full parse timed out or failed, using heuristics');

  // Level 4: Heuristics (last resort)
  const heuristicResult = heuristicCandidates(content, line);

  if (heuristicResult.selectors.length > 0) {
    reasons.push('Heuristics generated candidates');
    reasons.push(...heuristicResult.reasons);

    return {
      selectors: heuristicResult.selectors,
      hint: heuristicResult.hint,
      element: heuristicResult.element,
    };
  }

  // Complete failure
  reasons.push('All parsing strategies failed');
  return null;
}

/**
 * Convert line/col to absolute position in file
 */
function getPositionFromLineCol(content: string, line: number, col: number): number {
  const lines = content.split(/\r?\n/);
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
 * Build selector hint from attributes and text content
 */
function buildHintFromAttributes(
  attributes: Record<string, string>,
  elementText?: string
): SelectorHint {
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

  // Add text selector for short text content (1-24 chars)
  // This improves LLM detection of "human-readable" elements like buttons
  if (elementText && elementText.length >= 1 && elementText.length <= 24) {
    hint.expectedText = elementText;
    if (!hint.testid && !hint.role) {
      // Prefer text over CSS for elements with readable text
      prefer.push('text');
    }
  }

  if (prefer.length === 0) {
    // Fallback to CSS if no semantic attributes
    prefer.push('css');
  }

  hint.prefer = prefer;

  return hint;
}

/**
 * Generate selector candidates from attributes and text content
 */
function generateSelectorsFromAttributes(
  attributes: Record<string, string>,
  elementText?: string
): string[] {
  const selectors: string[] = [];

  // Priority 1: data-testid (most stable for testing)
  if (attributes['data-testid']) {
    selectors.push(`[data-testid="${attributes['data-testid']}"]`);
  }

  // Priority 2: id (unique identifier, high specificity)
  if (attributes['id']) {
    selectors.push(`#${attributes['id']}`);
  }

  // Priority 3: role with aria-label (semantic, accessible)
  if (attributes['role']) {
    if (attributes['aria-label']) {
      selectors.push(`role:${attributes['role']}[name="${attributes['aria-label']}"]`);
    } else {
      selectors.push(`role:${attributes['role']}`);
    }
  }

  // Priority 4: text selector for short text (1-24 chars)
  if (elementText && elementText.length >= 1 && elementText.length <= 24) {
    // Escape special characters in text
    const escapedText = elementText.replace(/"/g, '\\"');
    selectors.push(`text:"${escapedText}"`);
  }

  // Priority 5: class (first class only for stability)
  if (attributes['className'] || attributes['class']) {
    const className = attributes['className'] || attributes['class'];
    const firstClass = className?.split(/\s+/)[0];
    if (firstClass) {
      selectors.push(`.${firstClass}`);
    }
  }

  return selectors;
}
