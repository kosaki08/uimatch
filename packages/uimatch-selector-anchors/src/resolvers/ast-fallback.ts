/**
 * Multi-tiered AST parsing strategy with progressive fallback
 *
 * This module implements a resilient parsing approach for large TypeScript/JSX files
 * that may exceed timeout limits. It provides three levels of parsing:
 *
 * 1. Fast Path - Quick extraction of tag name, data-testid, and id (300ms target)
 * 2. Attribute-Only - Shallow scan of JSX attributes without text content (600ms target)
 * 3. Heuristics - Best-effort selector generation based on partial information
 *
 * Each level produces progressively fewer selectors but runs faster, ensuring
 * we always return some candidates even for complex files.
 */

import ts from 'typescript';
import type { SelectorHint } from '../types/schema.js';
import { compileSafeRegex } from '../utils/safe-regex.js';
import { buildHintFromAttributes, generateSelectorsFromAttributes } from './selector-utils.js';

/**
 * Result of a parsing attempt at any level
 */
export interface ParseLevel {
  /**
   * Which parsing level was successful
   */
  level: 'fast-path' | 'attr-only' | 'heuristics' | 'failed';

  /**
   * Generated selector candidates
   */
  selectors: string[];

  /**
   * Extracted hint information
   */
  hint: SelectorHint;

  /**
   * Element information (may be partial depending on level)
   */
  element?: {
    tag?: string;
    attributes: Record<string, string>;
    text?: string;
  };

  /**
   * Reasons explaining what happened at this level
   */
  reasons: string[];
}

/**
 * Fast path parser - extracts only critical attributes
 * Target: < 300ms for most files
 *
 * @param element - JSX element to parse
 * @returns Minimal selector information
 */
export function fastPathParse(element: ts.JsxElement | ts.JsxSelfClosingElement): ParseLevel {
  const reasons: string[] = ['Fast path: extracting critical attributes only'];
  const attributes: Record<string, string> = {};
  const selectors: string[] = [];

  try {
    // Get tag name (always fast)
    const tag = ts.isJsxElement(element)
      ? element.openingElement.tagName.getText()
      : element.tagName.getText();

    // Extract only high-priority attributes
    const jsxAttributes = ts.isJsxElement(element)
      ? element.openingElement.attributes
      : element.attributes;

    for (const prop of jsxAttributes.properties) {
      if (ts.isJsxAttribute(prop)) {
        const name = prop.name.getText();

        // Only process critical attributes
        if (name === 'data-testid' || name === 'id') {
          const value = prop.initializer;
          if (value && ts.isStringLiteral(value)) {
            attributes[name] = value.text;
          }
        }
      }
    }

    // Build minimal selectors
    if (attributes['data-testid']) {
      selectors.push(`[data-testid="${attributes['data-testid']}"]`);
      reasons.push(`Found data-testid: ${attributes['data-testid']}`);
    }

    if (attributes['id']) {
      selectors.push(`#${attributes['id']}`);
      reasons.push(`Found id: ${attributes['id']}`);
    }

    // Build minimal hint
    const hint: SelectorHint = {
      prefer: attributes['data-testid'] ? ['testid'] : attributes['id'] ? ['css'] : [],
    };

    if (attributes['data-testid']) {
      hint.testid = attributes['data-testid'];
    }

    return {
      level: 'fast-path',
      selectors,
      hint,
      element: { tag, attributes },
      reasons,
    };
  } catch (error) {
    return {
      level: 'failed',
      selectors: [],
      hint: {},
      reasons: ['Fast path failed', error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Attribute-only parser - extracts all attributes but skips text content
 * Target: < 600ms for most files
 *
 * @param element - JSX element to parse
 * @returns Full attribute information without text
 */
export function attributeOnlyParse(element: ts.JsxElement | ts.JsxSelfClosingElement): ParseLevel {
  const reasons: string[] = ['Attribute-only: scanning all properties without text'];
  const attributes: Record<string, string> = {};
  const selectors: string[] = [];

  try {
    // Get tag name
    const tag = ts.isJsxElement(element)
      ? element.openingElement.tagName.getText()
      : element.tagName.getText();

    // Extract all attributes
    const jsxAttributes = ts.isJsxElement(element)
      ? element.openingElement.attributes
      : element.attributes;

    for (const prop of jsxAttributes.properties) {
      if (ts.isJsxAttribute(prop)) {
        const name = prop.name.getText();
        const value = prop.initializer;

        if (value && ts.isStringLiteral(value)) {
          attributes[name] = value.text;
        } else if (value && ts.isJsxExpression(value) && value.expression) {
          const expr = value.expression;
          if (ts.isStringLiteral(expr)) {
            attributes[name] = expr.text;
          } else if (expr.kind === ts.SyntaxKind.TrueKeyword) {
            attributes[name] = 'true';
          } else if (expr.kind === ts.SyntaxKind.FalseKeyword) {
            attributes[name] = 'false';
          }
        } else if (!value) {
          attributes[name] = 'true';
        }
      }
    }

    // Generate selectors and hint using common utilities
    const generatedSelectors = generateSelectorsFromAttributes(attributes, tag);
    selectors.push(...generatedSelectors);

    const hint = buildHintFromAttributes(attributes);

    reasons.push(`Extracted ${Object.keys(attributes).length} attributes`);
    reasons.push(`Generated ${selectors.length} selectors`);

    return {
      level: 'attr-only',
      selectors,
      hint,
      element: { tag, attributes },
      reasons,
    };
  } catch (error) {
    return {
      level: 'failed',
      selectors: [],
      hint: {},
      reasons: [
        'Attribute-only parse failed',
        error instanceof Error ? error.message : String(error),
      ],
    };
  }
}

/**
 * Heuristic candidate generator - creates reasonable selectors from minimal info
 * This is the last resort when AST parsing times out or fails
 *
 * @param sourceContent - Raw source code around the target location
 * @param line - Target line number
 * @returns Best-effort selector candidates
 */
export async function heuristicCandidates(
  sourceContent: string,
  line: number
): Promise<ParseLevel> {
  const reasons: string[] = ['Heuristics: generating candidates from source text'];
  const selectors: string[] = [];
  const attributes: Record<string, string> = {};

  try {
    const lines = sourceContent.split(/\r?\n/);
    const targetLine = lines[line - 1] || '';
    const contextLines = lines.slice(Math.max(0, line - 3), line + 3).join('\n');

    // Try to extract data-testid
    const testidResult = await compileSafeRegex('data-testid=["\'](([^"\'])+)["\']');
    if (testidResult.success) {
      const testidMatch = contextLines.match(testidResult.regex);
      if (testidMatch?.[1]) {
        const testid = testidMatch[1];
        attributes['data-testid'] = testid;
        selectors.push(`[data-testid="${testid}"]`);
        reasons.push(`Found data-testid via regex: ${testid}`);
      }
    } else {
      reasons.push(`data-testid regex failed: ${testidResult.error}, using literal search`);
      // Fallback to simple string search
      const testidLiteral = contextLines.match(/data-testid="([^"]+)"/);
      if (testidLiteral?.[1]) {
        const testid = testidLiteral[1];
        attributes['data-testid'] = testid;
        selectors.push(`[data-testid="${testid}"]`);
        reasons.push(`Found data-testid via literal search: ${testid}`);
      }
    }

    // Try to extract id
    const idResult = await compileSafeRegex('\\bid=["\'](([^"\'])+)["\']');
    if (idResult.success) {
      const idMatch = contextLines.match(idResult.regex);
      if (idMatch?.[1]) {
        const id = idMatch[1];
        attributes['id'] = id;
        selectors.push(`#${id}`);
        reasons.push(`Found id via regex: ${id}`);
      }
    } else {
      reasons.push(`id regex failed: ${idResult.error}, using literal search`);
      const idLiteral = contextLines.match(/id="([^"]+)"/);
      if (idLiteral?.[1]) {
        const id = idLiteral[1];
        attributes['id'] = id;
        selectors.push(`#${id}`);
        reasons.push(`Found id via literal search: ${id}`);
      }
    }

    // Try to extract role
    const roleResult = await compileSafeRegex('\\brole=["\'](([^"\'])+)["\']');
    if (roleResult.success) {
      const roleMatch = contextLines.match(roleResult.regex);
      if (roleMatch?.[1]) {
        const role = roleMatch[1];
        attributes['role'] = role;
        selectors.push(`role:${role}`);
        reasons.push(`Found role via regex: ${role}`);
      }
    } else {
      reasons.push(`role regex failed: ${roleResult.error}, using literal search`);
      const roleLiteral = contextLines.match(/role="([^"]+)"/);
      if (roleLiteral?.[1]) {
        const role = roleLiteral[1];
        attributes['role'] = role;
        selectors.push(`role:${role}`);
        reasons.push(`Found role via literal search: ${role}`);
      }
    }

    // Try to extract text content (between > and <)
    const textResult = await compileSafeRegex('>([^<]{1,24})<');
    if (textResult.success) {
      const textMatch = targetLine.match(textResult.regex);
      if (textMatch?.[1]) {
        const text = textMatch[1].trim();
        if (text) {
          const escapedText = text.replace(/"/g, '\\"');
          selectors.push(`text:"${escapedText}"`);
          reasons.push(`Found text content via regex: ${text}`);
        }
      }
    } else {
      reasons.push(`text regex failed: ${textResult.error}`);
    }

    // If we found nothing, try common tag patterns
    if (selectors.length === 0) {
      const tagResult = await compileSafeRegex('<(\\w+)\\b');
      if (tagResult.success) {
        const tagMatch = targetLine.match(tagResult.regex);
        if (tagMatch) {
          const tag = tagMatch[1];
          reasons.push(`Fallback to tag name: ${tag}`);
          // Don't add bare tag selectors as they're too fragile
          // Just note it in reasons for debugging
        }
      }
    }

    const hint: SelectorHint = {
      prefer: attributes['data-testid'] ? ['testid'] : attributes['role'] ? ['role'] : ['css'],
    };

    if (attributes['data-testid']) {
      hint.testid = attributes['data-testid'];
    }
    if (attributes['role']) {
      hint.role = attributes['role'];
    }

    return {
      level: selectors.length > 0 ? 'heuristics' : 'failed',
      selectors,
      hint,
      element: { attributes },
      reasons,
    };
  } catch (error) {
    return {
      level: 'failed',
      selectors: [],
      hint: {},
      reasons: ['Heuristics failed', error instanceof Error ? error.message : String(error)],
    };
  }
}
