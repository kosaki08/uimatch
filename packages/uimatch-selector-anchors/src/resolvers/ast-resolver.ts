import type { SelectorHint } from '#anchors/types/schema';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  buildHintFromAttributes as buildHint,
  generateSelectorsFromAttributes as generateSelectors,
} from './selector-utils.js';

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

  /**
   * Detailed reasons explaining resolution outcome
   */
  reasons: string[];
}

/**
 * Resolve selector from TypeScript/JSX source code
 *
 * @param file - Path to TypeScript/JSX file
 * @param line - Target line number (1-indexed)
 * @param col - Target column number (0-indexed)
 * @param timeouts - Optional configurable timeouts for tiered fallback strategy
 * @returns Resolver result with selector candidates
 */
export async function resolveFromTypeScript(
  file: string,
  line: number,
  col: number,
  timeouts?: {
    fastPath?: number;
    attr?: number;
    full?: number;
  }
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
    return {
      selectors: [],
      hint: {},
      reasons: ['No AST node found at specified position'],
    };
  }

  // Find JSX element
  const jsxElement = findJsxElement(targetNode);
  if (!jsxElement) {
    return {
      selectors: [],
      hint: {},
      reasons: ['AST node found but not a JSX element (might be plain TS/JS)'],
    };
  }

  // Use passed timeouts (which include config + env overrides from index.ts)
  // Fallback to config defaults if not provided
  const { getConfig } = await import('../types/config.js');
  const config = getConfig();

  const FAST = timeouts?.fastPath ?? config.timeouts.astFastPath;
  const ATTR = timeouts?.attr ?? config.timeouts.astAttr;
  const FULL = timeouts?.full ?? config.timeouts.astFull;

  // Tiered fallback strategy (design budget, not enforced timeout):
  // 1. Try fast path (FAST ms budget) - tag, data-testid, id only (lightweight)
  // 2. Try attribute-only (ATTR ms budget) - all attributes, no text
  // 3. Try full parse (FULL ms budget) - everything including text
  // 4. Fallback to heuristics - regex-based extraction

  const reasons: string[] = [];

  // Level 1: Fast path
  const fastResult = await withTimeout(Promise.resolve(fastPathParse(jsxElement)), FAST);

  if (fastResult && fastResult.selectors.length > 0) {
    reasons.push(`Fast path succeeded (< ${FAST}ms)`);
    reasons.push(...fastResult.reasons);

    return {
      selectors: fastResult.selectors,
      hint: fastResult.hint,
      element: fastResult.element,
      reasons,
    };
  }

  reasons.push('Fast path incomplete, trying attribute-only');

  // Level 2: Attribute-only
  const attrResult = await withTimeout(Promise.resolve(attributeOnlyParse(jsxElement)), ATTR);

  if (attrResult && attrResult.selectors.length > 0) {
    reasons.push(`Attribute-only succeeded (< ${ATTR}ms)`);
    reasons.push(...attrResult.reasons);

    return {
      selectors: attrResult.selectors,
      hint: attrResult.hint,
      element: attrResult.element,
      reasons,
    };
  }

  reasons.push('Attribute-only incomplete, trying full parse');

  // Level 3: Full parse (original implementation)
  const fullParseResult = await withTimeout(
    Promise.resolve(
      (() => {
        try {
          // Extract attributes and text content
          const attributes = extractJsxAttributes(jsxElement);
          const elementText = extractTextContent(jsxElement);
          const tag = getJsxTagName(jsxElement);

          const hint = buildHint(attributes, elementText);
          const selectors = generateSelectors(attributes, tag, elementText);

          return {
            selectors,
            hint,
            element: {
              tag,
              attributes,
              text: elementText,
            },
          };
        } catch {
          return null;
        }
      })()
    ),
    FULL
  );

  if (fullParseResult && fullParseResult.selectors.length > 0) {
    reasons.push(`Full parse succeeded (< ${FULL}ms)`);
    return { ...fullParseResult, reasons };
  }

  reasons.push('Full parse incomplete or failed, using heuristics');

  // Level 4: Heuristics (last resort)
  const heuristicResult = heuristicCandidates(content, line);

  if (heuristicResult.selectors.length > 0) {
    reasons.push('Heuristics generated candidates');
    reasons.push(...heuristicResult.reasons);

    return {
      selectors: heuristicResult.selectors,
      hint: heuristicResult.hint,
      element: heuristicResult.element,
      reasons,
    };
  }

  // Complete failure - return failure reasons even though we return null
  reasons.push('All parsing strategies failed: no JSX node or selectors found');
  return { selectors: [], hint: {}, reasons };
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
