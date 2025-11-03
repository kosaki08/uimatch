import type { SelectorHint } from '#anchors/types/schema';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildHintFromAttributes as buildHint,
  generateSelectorsFromAttributes as generateSelectors,
} from './selector-utils.js';

// Minimal type definitions to avoid top-level parse5 import
// These types mirror parse5's structure without importing the actual library
interface SourceCodeLocation {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

interface Attribute {
  name: string;
  value: string;
}

interface TextNode {
  nodeName: '#text';
  value: string;
  childNodes?: never;
}

interface Element {
  nodeName: string;
  tagName?: string;
  attrs?: Attribute[];
  childNodes?: Node[];
  sourceCodeLocation?: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
    startTag?: SourceCodeLocation;
  };
}

interface Document {
  childNodes: Node[];
}

type Node = Element | TextNode;
type ParentNode = Document | Element;

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

  /**
   * Detailed reasons explaining resolution outcome
   */
  reasons: string[];
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

  // Lazy import parse5 to avoid top-level dependency resolution
  const parse5 = await import('parse5');

  // Parse HTML with source location info
  const document: Document = parse5.parse(content, {
    sourceCodeLocationInfo: true,
  });

  // Find element at position
  // parse5's sourceCodeLocation is 1-based for columns, but caller convention is 0-based
  const targetElement = findElementAtPosition(document, line, col + 1);

  if (!targetElement) {
    return {
      selectors: [],
      hint: {},
      reasons: [`No HTML element found at line ${line}, col ${col}`],
    };
  }

  // Extract attributes and text content
  const attributes = extractAttributes(targetElement);
  const elementText = extractTextContent(targetElement);
  const tag = targetElement.nodeName;

  const hint = buildHint(attributes, elementText);
  const selectors = generateSelectors(attributes, tag, elementText);

  const reasons: string[] = [
    `HTML element <${tag}> found`,
    `Generated ${selectors.length} selector(s)`,
  ];

  if (Object.keys(attributes).length > 0) {
    reasons.push(`Extracted ${Object.keys(attributes).length} attribute(s)`);
  }

  return {
    selectors,
    hint,
    element: {
      tag,
      attributes,
      text: elementText,
    },
    reasons,
  };
}

/**
 * Find HTML element at specific line/col position
 * @param col1 - Column position (1-based, matching parse5 convention)
 */
function findElementAtPosition(node: ParentNode, line: number, col1: number): Element | null {
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
        (line === startTag.startLine && col1 >= startTag.startCol) ||
        (line > startTag.startLine && line < startTag.endLine) ||
        (line === startTag.endLine && col1 <= startTag.endCol);

      if (isInStartTag) {
        return child;
      }
    }

    // Check if position is within element's full range
    const isInElement =
      (line === location.startLine && col1 >= location.startCol) ||
      (line > location.startLine && line < location.endLine) ||
      (line === location.endLine && col1 <= location.endCol);

    if (isInElement && 'childNodes' in child) {
      // Recursively check children first (prefer most specific element)
      const childResult = findElementAtPosition(child, line, col1);
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
        collectText(child);
      }
    }
  }

  if ('childNodes' in element) {
    collectText(element);
  }

  return texts.length > 0 ? texts.join(' ') : undefined;
}
