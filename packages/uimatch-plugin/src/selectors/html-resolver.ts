import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as parse5 from 'parse5';
import type { SelectorHint } from './schema.js';

// parse5 tree adapter types
type Document = parse5.DefaultTreeAdapterMap['document'];
type Element = parse5.DefaultTreeAdapterMap['element'];
type Node = parse5.DefaultTreeAdapterMap['node'];
type ParentNode = parse5.DefaultTreeAdapterMap['parentNode'];

/**
 * Result of resolving a selector from HTML
 */
export interface HTMLResolverResult {
  /**
   * Generated selector candidates in priority order
   */
  selectors: string[];

  /**
   * Extracted hint information from the HTML
   */
  hint: SelectorHint;

  /**
   * The actual HTML element found at the location
   */
  element?: {
    tag: string;
    attributes: Record<string, string>;
    text?: string;
  };
}

/**
 * Resolve selector from HTML source code
 *
 * @param file - Path to HTML file
 * @param line - Target line number (1-indexed)
 * @param col - Target column number (0-indexed)
 * @returns Resolver result with selector candidates
 */
export async function resolveFromHTML(
  file: string,
  line: number,
  col: number
): Promise<HTMLResolverResult | null> {
  const absolutePath = resolve(file);
  const content = await readFile(absolutePath, 'utf-8');

  // Parse HTML with source location info
  const document: Document = parse5.parse(content, {
    sourceCodeLocationInfo: true,
  });

  // Find element at position
  const targetElement = findElementAtPosition(document, line, col);

  if (!targetElement) {
    return null;
  }

  // Extract attributes and generate selectors
  const attributes = extractAttributes(targetElement);
  const hint = buildHintFromAttributes(attributes);
  const selectors = generateSelectorsFromAttributes(attributes, targetElement);

  return {
    selectors,
    hint,
    element: {
      tag: targetElement.nodeName,
      attributes,
      text: extractTextContent(targetElement),
    },
  };
}

/**
 * Find HTML element at specific line/col position
 */
function findElementAtPosition(node: ParentNode, line: number, col: number): Element | null {
  if (!('childNodes' in node)) {
    return null;
  }

  // Check all child nodes
  for (const child of node.childNodes) {
    if (!isElement(child)) {
      continue;
    }

    const location = child.sourceCodeLocation;
    if (!location) {
      continue;
    }

    // Check if position is within element's opening tag
    const startTag = location.startTag;
    if (startTag) {
      const isInStartTag =
        (line === startTag.startLine && col >= startTag.startCol) ||
        (line > startTag.startLine && line < startTag.endLine) ||
        (line === startTag.endLine && col <= startTag.endCol);

      if (isInStartTag) {
        return child;
      }
    }

    // Check if position is within element's full range
    const isInElement =
      (line === location.startLine && col >= location.startCol) ||
      (line > location.startLine && line < location.endLine) ||
      (line === location.endLine && col <= location.endCol);

    if (isInElement && 'childNodes' in child) {
      // Recursively check children first (prefer most specific element)
      const childResult = findElementAtPosition(child as ParentNode, line, col);
      if (childResult) {
        return childResult;
      }
      return child;
    }
  }

  return null;
}

/**
 * Type guard for Element
 */
function isElement(node: Node): node is Element {
  return 'tagName' in node;
}

/**
 * Extract attributes from HTML element
 */
function extractAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};

  if ('attrs' in element && element.attrs) {
    for (const attr of element.attrs) {
      attributes[attr.name] = attr.value;
    }
  }

  return attributes;
}

/**
 * Extract text content from HTML element
 */
function extractTextContent(element: Element): string | undefined {
  const texts: string[] = [];

  function collectText(node: ParentNode): void {
    if (!('childNodes' in node)) {
      return;
    }

    for (const child of node.childNodes) {
      if ('value' in child && child.nodeName === '#text') {
        const text = child.value.trim();
        if (text) {
          texts.push(text);
        }
      } else if ('childNodes' in child) {
        collectText(child as ParentNode);
      }
    }
  }

  if ('childNodes' in element) {
    collectText(element as ParentNode);
  }

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
function generateSelectorsFromAttributes(
  attributes: Record<string, string>,
  element: Element
): string[] {
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
  if (attributes['class']) {
    const firstClass = attributes['class'].split(/\s+/)[0];
    if (firstClass) {
      selectors.push(`.${firstClass}`);
    }
  }

  // Priority 5: tag + unique attribute combination
  const tag = element.tagName;
  if (attributes['name']) {
    selectors.push(`${tag}[name="${attributes['name']}"]`);
  } else if (attributes['type']) {
    selectors.push(`${tag}[type="${attributes['type']}"]`);
  }

  return selectors;
}
