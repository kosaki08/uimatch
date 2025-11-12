/**
 * Selector resolution utilities for Playwright
 */

import { createLogger } from '@uimatch/shared-logging';
import type { Frame, Locator } from 'playwright';
import { normalizeText } from '../../utils/normalize';

const logger = createLogger({ package: '@uimatch/core', module: 'locator-resolver' });

/**
 * Applies `.first()` to the locator if UIMATCH_SELECTOR_FIRST=true.
 * Useful for handling multiple matching elements (e.g., getByRole, getByText).
 *
 * @param locator - Target locator
 * @returns Locator (optionally with `.first()`)
 */
export function applyFirstIfNeeded(locator: Locator): Locator {
  const useFirst = process.env.UIMATCH_SELECTOR_FIRST === 'true';
  return useFirst ? locator.first() : locator;
}

/**
 * Resolves a selector string with optional prefix to a Playwright Locator.
 *
 * Supported prefixes:
 * - `role:button[name="View docs"]` → getByRole('button', { name: 'View docs' })
 * - `role:button[name=/docs/i][exact]` → getByRole with regex name and exact option
 * - `role:heading[level=1]` → getByRole('heading', { level: 1 })
 * - `role:button[pressed=true|selected=true|checked=true]` → Boolean state options
 * - `testid:accordion-item` → getByTestId('accordion-item')
 * - `text:"Continue"` or `text:'Continue'` → getByText('Continue', { exact: true })
 * - `text:"Continue"[exact]` or `text:/Continue/i[exact]` → Explicit exact match
 * - `text:/Continue/i` → getByText(/Continue/i)
 * - `xpath://div[@class="header"]` → locator('xpath=//div[@class="header"]')
 * - `css:.bg-white` → locator('.bg-white')
 * - `dompath:__self__ > :nth-child(2)` → locator for child element (use after initial capture)
 * - No prefix → assumes CSS selector (backward compatible)
 * - CSS pseudo-classes (`:root`, `:has()`, etc.) → treated as CSS selectors
 *
 * Unknown prefixes:
 * - With UIMATCH_SELECTOR_STRICT=true → throws error (strict mode for CI)
 * - Otherwise → fallback to CSS selector (lenient mode for interactive use)
 *
 * @param frame - Target frame
 * @param selectorString - Selector with optional prefix
 * @returns Playwright Locator
 * @throws Error when prefix is unknown and UIMATCH_SELECTOR_STRICT=true
 */
export function resolveLocator(frame: Frame, selectorString: string): Locator {
  // DEBUG logging for troubleshooting
  const DEBUG = process.env.DEBUG?.includes('uimatch:selector');
  if (DEBUG) {
    logger.debug({ selector: selectorString }, 'input');
  }

  // Only match known prefixes to avoid false positives with CSS selectors
  // Known prefixes: role, testid, text, xpath, css, dompath
  // This regex explicitly matches ONLY known prefixes, so:
  // - `role:button` → matches (known prefix)
  // - `li:nth-child(1)` → no match (li is not a known prefix) → treated as CSS
  // - `:root` → no match (starts with colon) → treated as CSS
  // - `a[href*="https:"]` → no match (doesn't start with known prefix) → treated as CSS
  const knownPrefixes = ['role', 'testid', 'text', 'xpath', 'css', 'dompath'];
  const prefixPattern = new RegExp(`^(${knownPrefixes.join('|')}):(.*)$`, 's');
  const m = selectorString.match(prefixPattern);

  if (!m) {
    // No known prefix detected → treat as CSS selector
    if (DEBUG) {
      logger.debug('no known prefix → CSS fallback');
    }

    // In strict mode, check if selector looks like it might have a typo
    // (has a colon with a word before it that's not a known prefix)
    if (process.env.UIMATCH_SELECTOR_STRICT === 'true') {
      // Match only word-colon at the start, not followed by '[' (to exclude attribute selectors like a[href*="https:"])
      // Also exclude common CSS pseudo-classes/elements to avoid false positives
      const cssPseudoPattern =
        /:(?:nth-child|nth-of-type|first-child|last-child|first-of-type|last-of-type|only-child|only-of-type|hover|focus|active|visited|link|disabled|enabled|checked|indeterminate|root|empty|target|lang|not|is|where|has|before|after|first-line|first-letter)/i;

      // Only check for unknown prefix if it's not a CSS pseudo-class/element
      if (!cssPseudoPattern.test(selectorString)) {
        const unknownPrefixCheck = selectorString.match(/^([a-z][\w-]*):(?!\[)/i);
        if (unknownPrefixCheck) {
          const [, suspiciousPrefix] = unknownPrefixCheck;
          throw new Error(
            `Unknown selector prefix: "${suspiciousPrefix}"\n` +
              `Supported prefixes: ${knownPrefixes.join(', ')}\n` +
              `If this is a CSS selector (e.g., "li:nth-child(1)"), ` +
              `set UIMATCH_SELECTOR_STRICT=false to enable CSS fallback.`
          );
        }
      }
    }

    return applyFirstIfNeeded(frame.locator(selectorString));
  }

  const prefix = m[1];
  const rest = m[2];

  // Type guard: ensure prefix and rest are defined
  if (!prefix || !rest) {
    throw new Error(`Invalid selector format: "${selectorString}"`);
  }

  switch (prefix) {
    case 'role': {
      // Parse role:button[name="View docs"][exact] or role:button[name=/.../i][level=1]
      // Basic format: role:button or role:button[name="text"]
      const roleMatch = /^([a-z]+)(.*)$/i.exec(rest);
      if (!roleMatch) {
        throw new Error(`Invalid role selector format: "${selectorString}"`);
      }
      const [, roleName, optionsStr] = roleMatch;
      if (!roleName) {
        throw new Error(`Invalid role selector format: "${selectorString}"`);
      }

      // Parse options from bracket notation
      const options: Parameters<typeof frame.getByRole>[1] = {};
      if (optionsStr) {
        // Extract [name="..."] or [name=/.../i]
        const nameMatch = /\[name=(?:"([^"]+)"|\/([^/]+)\/([a-z]*)|'([^']+)')\]/i.exec(optionsStr);
        if (nameMatch) {
          if (nameMatch[1] || nameMatch[4]) {
            // String name: [name="text"] or [name='text']
            options.name = nameMatch[1] || nameMatch[4];
          } else if (nameMatch[2]) {
            // Regex name: [name=/pattern/flags]
            options.name = new RegExp(nameMatch[2], nameMatch[3] || '');
          }
        }

        // Extract [exact]
        if (/\[exact\]/i.test(optionsStr)) {
          options.exact = true;
        }

        // Extract [level=N]
        const levelMatch = /\[level=(\d+)\]/i.exec(optionsStr);
        if (levelMatch) {
          options.level = Number(levelMatch[1]);
        }

        // Extract [pressed=true|false]
        const pressedMatch = /\[pressed=(true|false)\]/i.exec(optionsStr);
        if (pressedMatch) {
          options.pressed = pressedMatch[1] === 'true';
        }

        // Extract boolean options: [selected=true|false], [checked=true|false], etc.
        const booleanOptions = [
          'selected',
          'checked',
          'expanded',
          'disabled',
          'includeHidden',
        ] as const;
        for (const key of booleanOptions) {
          const pattern = new RegExp(`\\[${key}=(true|false)\\]`, 'i');
          const match = pattern.exec(optionsStr);
          if (match) {
            // Use type assertion to satisfy TypeScript
            (options as Record<string, unknown>)[key] = match[1] === 'true';
          }
        }
      }

      // Boolean options (selected, checked, etc.) can be slow with getByRole heuristics
      // Convert to CSS selector with both aria-* and native :checked/:disabled support
      const hasBoolean =
        optionsStr &&
        /\[(selected|checked|pressed|expanded|disabled)=(true|false)\]/i.test(optionsStr);
      const hasName = optionsStr && /\[name=/.test(optionsStr);

      // Only apply CSS fallback for boolean options when name is not specified
      // This prevents losing accessible name filtering accuracy
      if (hasBoolean && optionsStr && !hasName) {
        const getBool = (key: string): string | undefined => {
          const match = new RegExp(`\\[${key}=(true|false)\\]`, 'i').exec(optionsStr);
          return match?.[1];
        };

        const selected = getBool('selected');
        const pressed = getBool('pressed');
        const expanded = getBool('expanded');
        const disabled = getBool('disabled');
        const checked = getBool('checked');

        // Build base selector with boolean attributes (excluding checked which needs union)
        let base = `[role="${roleName}"]`;
        if (selected) base += `[aria-selected="${selected}"]`;
        if (pressed) base += `[aria-pressed="${pressed}"]`;
        if (expanded) base += `[aria-expanded="${expanded}"]`;
        if (disabled) base += `[aria-disabled="${disabled}"]`;

        let locator: Locator;
        if (checked) {
          // Support both aria-checked and native :checked pseudo-class
          // Use comma-separated union instead of :is() for better Playwright CSS compatibility
          if (roleName === 'checkbox' || roleName === 'radio') {
            const union =
              checked === 'true'
                ? `${base}[aria-checked="true"], ${base}:checked`
                : `${base}[aria-checked="false"], ${base}:not(:checked)`;
            locator = frame.locator(union);
          } else {
            locator = frame.locator(`${base}[aria-checked="${checked}"]`);
          }
        } else {
          locator = frame.locator(base);
        }

        if (DEBUG) {
          logger.debug({ roleName, selector: checked ? 'union' : base }, 'role (CSS fallback)');
        }
        return applyFirstIfNeeded(locator);
      }

      // No boolean options: use standard getByRole
      if (DEBUG) {
        logger.debug({ roleName, ...options }, 'role');
      }
      return applyFirstIfNeeded(
        frame.getByRole(roleName as Parameters<typeof frame.getByRole>[0], options)
      );
    }

    case 'testid': {
      if (!rest.trim()) {
        throw new Error(`Invalid selector format: "${selectorString}"`);
      }
      if (DEBUG) {
        logger.debug('testid:', rest);
      }
      return applyFirstIfNeeded(frame.getByTestId(rest));
    }

    case 'text': {
      let s = rest.trim();

      // Check for [exact] flag and remove it from the string
      const exactFlag = /\[exact\]/i.test(s);
      s = s.replace(/\[exact\]/gi, '').trim();

      // Handle quoted strings with [exact] flag: use XPath for deterministic matching
      // This avoids getByText heuristics which can be slow in some environments
      if (
        exactFlag &&
        ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
      ) {
        let raw = s.slice(1, -1);
        // Handle escape sequences: \\ must be processed first to avoid double-processing
        raw = raw
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t');

        // Apply i18n-resilient normalization (NFKC, trim, whitespace compression)
        raw = normalizeText(raw);

        // XPath string literal helper (handles quotes in text)
        const xpathLiteral = (text: string): string => {
          if (!text.includes("'")) return `'${text}'`;
          if (!text.includes('"')) return `"${text}"`;
          // Mixed quotes: use concat()
          return `concat('${text.split("'").join(`',"'","'`)}')`;
        };

        if (DEBUG) {
          logger.debug({ text: raw }, 'text (XPath exact)');
        }
        return frame.locator(`xpath=//*[normalize-space(.)=${xpathLiteral(raw)}]`);
      }

      // Handle quoted strings without [exact]: use getByText with exact:true
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        let raw = s.slice(1, -1);
        // Handle escape sequences: \\ must be processed first to avoid double-processing
        raw = raw
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t');

        // Apply i18n-resilient normalization (NFKC, trim, whitespace compression)
        raw = normalizeText(raw);

        if (DEBUG) {
          logger.debug({ text: raw, exact: true }, 'text (quoted)');
        }
        // Quoted strings always use exact:true
        return applyFirstIfNeeded(frame.getByText(raw, { exact: true }));
      }

      // Handle regex: text:/Continue/i
      if (s.startsWith('/')) {
        const lastSlash = s.lastIndexOf('/');
        if (lastSlash > 0) {
          const pattern = s.slice(1, lastSlash);
          const flags = s.slice(lastSlash + 1);
          if (DEBUG) {
            logger.debug(
              {
                pattern,
                flags,
                exact: exactFlag || false,
              },
              'text (regex)'
            );
          }
          return applyFirstIfNeeded(
            frame.getByText(new RegExp(pattern, flags), { exact: exactFlag || false })
          );
        }
      }

      // Default: treat as plain text (with normalization)
      const normalizedText = normalizeText(s);
      if (DEBUG) {
        logger.debug(
          {
            text: normalizedText,
            exact: exactFlag || false,
          },
          'text (plain)'
        );
      }
      return applyFirstIfNeeded(frame.getByText(normalizedText, { exact: exactFlag || false }));
    }

    case 'xpath': {
      if (DEBUG) {
        logger.debug('xpath:', rest);
      }
      return applyFirstIfNeeded(frame.locator(`xpath=${rest}`));
    }

    case 'css': {
      if (DEBUG) {
        logger.debug('css:', rest);
      }
      return applyFirstIfNeeded(frame.locator(rest));
    }

    case 'dompath': {
      // Internal DOM path after capture (e.g., "__self__ > :nth-child(2)")
      if (DEBUG) {
        logger.debug('dompath:', rest);
      }
      // Don't apply first() for internal DOM paths - we want exact child selector
      return frame.locator(rest);
    }
  }

  // This should never be reached due to knownPrefixes check above
  throw new Error(`Unhandled selector prefix: "${prefix}"`);
}
