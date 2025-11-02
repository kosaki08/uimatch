import type { SelectorHint } from '#anchors/types/schema';

/**
 * Role options that can be combined with native pseudo-classes
 */
interface RoleOptions {
  checked?: boolean;
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  name?: string;
}

/**
 * Build selector hint from attributes and text content
 * Shared logic for both AST and HTML resolvers
 */
export function buildHintFromAttributes(
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
 * Extract role options from attributes
 * Supports both ARIA attributes and boolean HTML attributes
 */
function extractRoleOptions(attributes: Record<string, string>): RoleOptions {
  const options: RoleOptions = {};

  // ARIA checked state - use union of aria-checked and :checked
  if (attributes['aria-checked'] === 'true' || attributes['checked'] === 'true') {
    options.checked = true;
  }

  // ARIA selected state - use union of aria-selected and native selected
  if (attributes['aria-selected'] === 'true' || attributes['selected'] === 'true') {
    options.selected = true;
  }

  // ARIA expanded state - no native pseudo-class equivalent
  if (attributes['aria-expanded'] === 'true') {
    options.expanded = true;
  }

  // Disabled state - use union of aria-disabled and :disabled
  if (attributes['aria-disabled'] === 'true' || attributes['disabled'] === 'true') {
    options.disabled = true;
  }

  // ARIA label as name option
  if (attributes['aria-label']) {
    options.name = attributes['aria-label'];
  }

  return options;
}

/**
 * Generate role selector with options
 * Includes native pseudo-class fallbacks where applicable
 */
function generateRoleSelector(role: string, options: RoleOptions): string[] {
  const selectors: string[] = [];

  // Build role selector with ARIA options
  const roleOptions: string[] = [];

  if (options.name) {
    roleOptions.push(`name="${options.name}"`);
  }

  if (options.checked !== undefined) {
    roleOptions.push(`checked=${options.checked}`);
  }

  if (options.selected !== undefined) {
    roleOptions.push(`selected=${options.selected}`);
  }

  if (options.expanded !== undefined) {
    roleOptions.push(`expanded=${options.expanded}`);
  }

  if (options.disabled !== undefined) {
    roleOptions.push(`disabled=${options.disabled}`);
  }

  // Primary: role with options
  if (roleOptions.length > 0) {
    selectors.push(`role:${role}[${roleOptions.join('][')}]`);
  } else {
    selectors.push(`role:${role}`);
  }

  return selectors;
}

/**
 * Generate CSS fallback selectors with native pseudo-classes
 * Used when role-based selection needs reinforcement
 */
function generateCSSFallbacks(
  tag: string,
  attributes: Record<string, string>,
  options: RoleOptions
): string[] {
  const selectors: string[] = [];

  // Build base selector with most specific attributes first
  const parts: string[] = [tag];

  // Priority 1: ID (highest specificity)
  if (attributes['id']) {
    parts.push(`#${attributes['id']}`);
  }

  // Priority 2: First class (stable)
  const className = attributes['class'] || attributes['className'];
  if (className) {
    const firstClass = className.split(/\s+/)[0];
    if (firstClass) {
      parts.push(`.${firstClass}`);
    }
  }

  // Priority 3: Type attribute (for inputs)
  if (attributes['type']) {
    parts.push(`[type="${attributes['type']}"]`);
  }

  // Priority 4: Name attribute
  if (attributes['name']) {
    parts.push(`[name="${attributes['name']}"]`);
  }

  const baseSelector = parts.join('');

  // Add native pseudo-class states
  const pseudoClasses: string[] = [];

  // checked: use :checked pseudo-class for native elements
  if (options.checked) {
    pseudoClasses.push(':checked');
  }

  // disabled: use :disabled pseudo-class for native elements
  if (options.disabled) {
    pseudoClasses.push(':disabled');
  }

  // selected: for <option> elements
  if (options.selected && tag === 'option') {
    pseudoClasses.push(':checked'); // :checked works for selected options
  }

  if (pseudoClasses.length > 0) {
    selectors.push(baseSelector + pseudoClasses.join(''));
  } else if (baseSelector !== tag) {
    // Only add if more specific than just tag
    selectors.push(baseSelector);
  }

  return selectors;
}

/**
 * Generate selector candidates from attributes and text content
 * Shared logic for both AST and HTML resolvers with consistent ordering
 */
export function generateSelectorsFromAttributes(
  attributes: Record<string, string>,
  tag: string,
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

  // Priority 3: role with options (semantic, accessible)
  if (attributes['role']) {
    const roleOptions = extractRoleOptions(attributes);
    const roleSelectors = generateRoleSelector(attributes['role'], roleOptions);
    selectors.push(...roleSelectors);

    // Add CSS fallbacks with native pseudo-classes for better matching
    const cssFallbacks = generateCSSFallbacks(tag, attributes, roleOptions);
    selectors.push(...cssFallbacks);
  }

  // Priority 4: text selector for short text (1-24 chars)
  if (elementText && elementText.length >= 1 && elementText.length <= 24) {
    // Escape special characters in text
    const escapedText = elementText.replace(/"/g, '\\"');
    selectors.push(`text:"${escapedText}"`);
  }

  // Priority 5: class (first class only for stability)
  if (!attributes['role']) {
    // Only add if not already added via role fallback
    const className = attributes['class'] || attributes['className'];
    if (className) {
      const firstClass = className.split(/\s+/)[0];
      if (firstClass) {
        selectors.push(`.${firstClass}`);
      }
    }
  }

  // Priority 6: tag + unique attribute combination
  if (!attributes['id'] && !attributes['data-testid']) {
    // Only add if not already covered by higher priority selectors
    if (attributes['name']) {
      selectors.push(`${tag}[name="${attributes['name']}"]`);
    } else if (attributes['type']) {
      selectors.push(`${tag}[type="${attributes['type']}"]`);
    }
  }

  return selectors;
}

/**
 * Calculate specificity score for a selector
 * Used for ordering selector candidates consistently
 *
 * Scoring system (aligned with CSS specificity):
 * - data-testid: 100 points (most stable for testing)
 * - ID (#foo): 100 points (unique identifier)
 * - role with options: 80 points + 5 per option
 * - class (.foo): 10 points per class
 * - attribute ([type="text"]): 10 points per attribute
 * - pseudo-class (:checked): 10 points per pseudo-class
 * - tag (button): 1 point per tag
 * - text selector: 0 points (non-CSS, Playwright-specific)
 *
 * Note: Properly counts ID selectors to avoid false negatives with #id syntax
 */
export function calculateSpecificityScore(selector: string): number {
  // Special case: text selectors have no CSS specificity
  if (selector.startsWith('text:') || selector.startsWith('text="')) {
    return 0;
  }

  // Special case: role selectors should not count as tag
  const isRoleSelector = selector.startsWith('role:');

  let score = 0;

  // data-testid (highest priority for testing)
  if (selector.includes('data-testid')) {
    score += 100;
  }

  // ID selector: count #foo patterns (must be # followed by identifier)
  // Strip attribute selectors first to avoid counting # inside [href="#foo"]
  const withoutAttrs = selector.replace(/\[[^\]]*\]/g, '');
  const idMatches = withoutAttrs.match(/#[a-zA-Z_][\w-]*/g);
  if (idMatches) {
    score += idMatches.length * 100;
  }

  // role selector (semantic, accessible)
  if (isRoleSelector) {
    score += 80;
    // Add points for each option
    const optionCount = (selector.match(/\[/g) || []).length;
    score += optionCount * 5;
    // Early return to avoid tag counting
    return score;
  }

  // Class selector: count .classname patterns
  const classMatches = selector.match(/\.[a-zA-Z_][\w-]*/g);
  if (classMatches) {
    score += classMatches.length * 10;
  }

  // Attribute selector: count [attr] or [attr="value"] patterns
  const attrMatches = selector.match(/\[[^\]]+\]/g);
  if (attrMatches) {
    score += attrMatches.length * 10;
  }

  // Pseudo-class selector: count :pseudo patterns
  // Must be single colon (not ::), and extract just the :pseudo part
  const pseudoMatches = selector.match(/:(?!:)[a-z-]+/g);
  if (pseudoMatches) {
    // Count each pseudo-class occurrence
    score += pseudoMatches.length * 10;
  }

  // Tag selector (lowest priority)
  // Count number of tag selectors (separated by space, >, +, ~)
  // Exclude if selector is empty, wildcard, or non-tag patterns
  if (selector === '' || selector === '*') {
    return score; // No tag score for empty or universal selector
  }

  // Split by combinators and count valid tag names
  const parts = selector.split(/[\s>+~]+/);
  for (const part of parts) {
    // Check if part starts with a lowercase letter (tag selector)
    // Exclude if it starts with #, ., [, or :
    if (part && /^[a-z]/i.test(part) && !/^[#.[]:]/.test(part)) {
      score += 1;
    }
  }

  return score;
}
