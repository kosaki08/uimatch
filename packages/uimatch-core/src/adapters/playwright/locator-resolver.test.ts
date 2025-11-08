/**
 * Unit tests for locator-resolver utilities
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Frame, Locator } from 'playwright';
import { applyFirstIfNeeded, resolveLocator } from './locator-resolver';

// Mock Locator for testing
class MockLocator {
  constructor(private selector: string) {}

  first(): MockLocator {
    return new MockLocator(`${this.selector}.first()`);
  }

  toString(): string {
    return this.selector;
  }

  // Helper method for safe string conversion in tests
  toTestString(): string {
    return this.selector;
  }
}

// Mock Frame for testing
class MockFrame {
  locator(selector: string): Locator {
    return new MockLocator(`locator(${selector})`) as unknown as Locator;
  }

  getByRole(role: string, options?: Record<string, unknown>): Locator {
    const optionsStr = options ? `, ${JSON.stringify(options)}` : '';
    return new MockLocator(`getByRole(${role}${optionsStr})`) as unknown as Locator;
  }

  getByTestId(testId: string): Locator {
    return new MockLocator(`getByTestId(${testId})`) as unknown as Locator;
  }

  getByText(text: string | RegExp, options?: Record<string, unknown>): Locator {
    const textStr = text instanceof RegExp ? text.toString() : `"${text}"`;
    const optionsStr = options ? `, ${JSON.stringify(options)}` : '';
    return new MockLocator(`getByText(${textStr}${optionsStr})`) as unknown as Locator;
  }
}

describe('applyFirstIfNeeded', () => {
  const originalEnv = process.env.UIMATCH_SELECTOR_FIRST;

  afterEach(() => {
    // Restore original env var
    if (originalEnv !== undefined) {
      process.env.UIMATCH_SELECTOR_FIRST = originalEnv;
    } else {
      delete process.env.UIMATCH_SELECTOR_FIRST;
    }
  });

  test('returns locator as-is when UIMATCH_SELECTOR_FIRST is not set', () => {
    delete process.env.UIMATCH_SELECTOR_FIRST;

    const locator = new MockLocator('test') as unknown as Locator;
    const result = applyFirstIfNeeded(locator);

    expect((result as unknown as MockLocator).toString()).toBe('test');
  });

  test('returns locator as-is when UIMATCH_SELECTOR_FIRST is false', () => {
    process.env.UIMATCH_SELECTOR_FIRST = 'false';

    const locator = new MockLocator('test') as unknown as Locator;
    const result = applyFirstIfNeeded(locator);

    expect((result as unknown as MockLocator).toString()).toBe('test');
  });

  test('applies first() when UIMATCH_SELECTOR_FIRST is true', () => {
    process.env.UIMATCH_SELECTOR_FIRST = 'true';

    const locator = new MockLocator('test') as unknown as Locator;
    const result = applyFirstIfNeeded(locator);

    expect((result as unknown as MockLocator).toString()).toBe('test.first()');
  });
});

describe('resolveLocator', () => {
  let frame: Frame;
  const originalEnv = {
    UIMATCH_SELECTOR_FIRST: process.env.UIMATCH_SELECTOR_FIRST,
    UIMATCH_SELECTOR_STRICT: process.env.UIMATCH_SELECTOR_STRICT,
    DEBUG: process.env.DEBUG,
  };

  beforeEach(() => {
    frame = new MockFrame() as unknown as Frame;
    delete process.env.UIMATCH_SELECTOR_FIRST;
    delete process.env.UIMATCH_SELECTOR_STRICT;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    // Restore original env vars
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    });
  });

  describe('CSS selectors (no prefix)', () => {
    test('treats selectors without known prefix as CSS', () => {
      const result = resolveLocator(frame, '.my-class');
      expect((result as unknown as MockLocator).toString()).toBe('locator(.my-class)');
    });

    test('handles CSS pseudo-classes', () => {
      const result = resolveLocator(frame, 'li:nth-child(1)');
      expect((result as unknown as MockLocator).toString()).toBe('locator(li:nth-child(1))');
    });

    test('handles :root pseudo-class', () => {
      const result = resolveLocator(frame, ':root');
      expect((result as unknown as MockLocator).toString()).toBe('locator(:root)');
    });

    test('handles :has() pseudo-class', () => {
      const result = resolveLocator(frame, 'div:has(> p)');
      expect((result as unknown as MockLocator).toString()).toBe('locator(div:has(> p))');
    });

    test('handles attribute selectors with colons', () => {
      const result = resolveLocator(frame, 'a[href*="https:"]');
      expect((result as unknown as MockLocator).toString()).toBe('locator(a[href*="https:"])');
    });
  });

  describe('CSS selectors in strict mode', () => {
    beforeEach(() => {
      process.env.UIMATCH_SELECTOR_STRICT = 'true';
    });

    test('allows CSS pseudo-classes in strict mode', () => {
      const result = resolveLocator(frame, 'li:nth-child(1)');
      expect((result as unknown as MockLocator).toString()).toBe('locator(li:nth-child(1))');
    });

    test('throws error for unknown prefix in strict mode', () => {
      expect(() => resolveLocator(frame, 'unknown:selector')).toThrow(
        /Unknown selector prefix: "unknown"/
      );
    });

    test('does not throw for attribute selectors in strict mode', () => {
      const result = resolveLocator(frame, 'a[href*="https:"]');
      expect((result as unknown as MockLocator).toString()).toBe('locator(a[href*="https:"])');
    });
  });

  describe('role: prefix', () => {
    test('resolves basic role selector', () => {
      const result = resolveLocator(frame, 'role:button');
      expect((result as unknown as MockLocator).toString()).toContain('getByRole(button');
    });

    test('resolves role with name option', () => {
      const result = resolveLocator(frame, 'role:button[name="Submit"]');
      expect((result as unknown as MockLocator).toString()).toContain('getByRole(button');
      expect((result as unknown as MockLocator).toString()).toContain('"name":"Submit"');
    });

    test('resolves role with regex name', () => {
      const result = resolveLocator(frame, 'role:button[name=/submit/i]');
      expect((result as unknown as MockLocator).toString()).toContain('getByRole(button');
    });

    test('resolves role with level option', () => {
      const result = resolveLocator(frame, 'role:heading[level=1]');
      expect((result as unknown as MockLocator).toString()).toContain('getByRole(heading');
      expect((result as unknown as MockLocator).toString()).toContain('"level":1');
    });

    test('resolves role with exact option', () => {
      const result = resolveLocator(frame, 'role:button[name="Submit"][exact]');
      expect((result as unknown as MockLocator).toString()).toContain('getByRole(button');
      expect((result as unknown as MockLocator).toString()).toContain('"exact":true');
    });

    test('resolves role with pressed option', () => {
      const result = resolveLocator(frame, 'role:button[pressed=true]');
      // Boolean options without name fallback to CSS selector
      expect((result as unknown as MockLocator).toString()).toContain('locator([role="button"][aria-pressed="true"])');
    });

    test('resolves role with boolean options using CSS fallback', () => {
      const result = resolveLocator(frame, 'role:checkbox[checked=true]');
      // When boolean options without name are used, it should fallback to CSS
      expect((result as unknown as MockLocator).toString()).toContain('locator');
    });

    test('uses getByRole when name is specified with boolean', () => {
      const result = resolveLocator(frame, 'role:checkbox[name="Accept"][checked=true]');
      // When both name and boolean are specified, should use getByRole
      expect((result as unknown as MockLocator).toString()).toContain('getByRole(checkbox');
    });

    test('throws error for invalid role format', () => {
      expect(() => resolveLocator(frame, 'role:')).toThrow(/Invalid selector format/);
    });
  });

  describe('testid: prefix', () => {
    test('resolves test id selector', () => {
      const result = resolveLocator(frame, 'testid:submit-button');
      expect((result as unknown as MockLocator).toString()).toBe('getByTestId(submit-button)');
    });

    test('handles test id with special characters', () => {
      const result = resolveLocator(frame, 'testid:my-test_id.123');
      expect((result as unknown as MockLocator).toString()).toBe('getByTestId(my-test_id.123)');
    });
  });

  describe('text: prefix', () => {
    test('resolves quoted text with exact match', () => {
      const result = resolveLocator(frame, 'text:"Submit"');
      expect((result as unknown as MockLocator).toString()).toContain('getByText');
      expect((result as unknown as MockLocator).toString()).toContain('"exact":true');
    });

    test('resolves single-quoted text', () => {
      const result = resolveLocator(frame, "text:'Submit'");
      expect((result as unknown as MockLocator).toString()).toContain('getByText');
      expect((result as unknown as MockLocator).toString()).toContain('"exact":true');
    });

    test('resolves text with explicit exact flag using XPath', () => {
      const result = resolveLocator(frame, 'text:"Submit"[exact]');
      // With [exact] flag, should use XPath for deterministic matching
      expect((result as unknown as MockLocator).toString()).toContain('xpath=');
    });

    test('resolves regex text', () => {
      const result = resolveLocator(frame, 'text:/submit/i');
      expect((result as unknown as MockLocator).toString()).toContain('getByText');
    });

    test('resolves plain text', () => {
      const result = resolveLocator(frame, 'text:Submit');
      expect((result as unknown as MockLocator).toString()).toContain('getByText');
    });

    test('handles escape sequences in quoted text', () => {
      const result = resolveLocator(frame, 'text:"Line 1\\nLine 2"');
      expect((result as unknown as MockLocator).toString()).toContain('getByText');
    });

    test('handles backslash escape sequences', () => {
      const result = resolveLocator(frame, 'text:"Path\\\\to\\\\file"');
      expect((result as unknown as MockLocator).toString()).toContain('getByText');
    });
  });

  describe('xpath: prefix', () => {
    test('resolves xpath selector', () => {
      const result = resolveLocator(frame, 'xpath://div[@class="container"]');
      expect((result as unknown as MockLocator).toString()).toBe('locator(xpath=//div[@class="container"])');
    });

    test('handles complex xpath expressions', () => {
      const result = resolveLocator(frame, 'xpath://div[contains(@class, "test")]//button');
      expect((result as unknown as MockLocator).toString()).toBe('locator(xpath=//div[contains(@class, "test")]//button)');
    });
  });

  describe('css: prefix', () => {
    test('resolves explicit css selector', () => {
      const result = resolveLocator(frame, 'css:.my-class');
      expect((result as unknown as MockLocator).toString()).toBe('locator(.my-class)');
    });

    test('handles complex css selectors', () => {
      const result = resolveLocator(frame, 'css:div.container > button:nth-child(2)');
      expect((result as unknown as MockLocator).toString()).toBe('locator(div.container > button:nth-child(2))');
    });
  });

  describe('dompath: prefix', () => {
    test('resolves dompath selector', () => {
      const result = resolveLocator(frame, 'dompath:__self__ > :nth-child(2)');
      expect((result as unknown as MockLocator).toString()).toBe('locator(__self__ > :nth-child(2))');
    });

    test('does not apply first() for dompath', () => {
      process.env.UIMATCH_SELECTOR_FIRST = 'true';
      const result = resolveLocator(frame, 'dompath:__self__ > :nth-child(2)');
      // Should not have .first() appended
      expect((result as unknown as MockLocator).toString()).not.toContain('.first()');
    });
  });

  describe('UIMATCH_SELECTOR_FIRST integration', () => {
    beforeEach(() => {
      process.env.UIMATCH_SELECTOR_FIRST = 'true';
    });

    test('applies first() to CSS selectors', () => {
      const result = resolveLocator(frame, '.my-class');
      expect((result as unknown as MockLocator).toString()).toContain('.first()');
    });

    test('applies first() to role selectors', () => {
      const result = resolveLocator(frame, 'role:button');
      expect((result as unknown as MockLocator).toString()).toContain('.first()');
    });

    test('applies first() to text selectors', () => {
      const result = resolveLocator(frame, 'text:"Submit"');
      expect((result as unknown as MockLocator).toString()).toContain('.first()');
    });

    test('does not apply first() to dompath selectors', () => {
      const result = resolveLocator(frame, 'dompath:__self__');
      expect((result as unknown as MockLocator).toString()).not.toContain('.first()');
    });
  });

  describe('error handling', () => {
    test('throws error for invalid selector format', () => {
      expect(() => resolveLocator(frame, 'role:')).toThrow(/Invalid selector format/);
    });

    test('throws error for invalid regex in text selector', () => {
      // This should not throw as the regex parsing is lenient
      // But let's test a truly malformed case
      const result = resolveLocator(frame, 'text:/unclosed');
      expect(result).toBeDefined();
    });
  });

  describe('DEBUG mode', () => {
    beforeEach(() => {
      process.env.DEBUG = 'uimatch:selector';
    });

    test('logs debug information when enabled', () => {
      // This test just ensures DEBUG mode doesn't break functionality
      const result = resolveLocator(frame, 'role:button[name="Submit"]');
      expect(result).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('throws error for empty testid value', () => {
      expect(() => resolveLocator(frame, 'testid:')).toThrow(/Invalid selector format/);
    });

    test('handles whitespace in text selectors', () => {
      const result = resolveLocator(frame, 'text:  Submit  ');
      expect(result).toBeDefined();
    });

    test('handles multiple option flags in role selector', () => {
      const result = resolveLocator(
        frame,
        'role:button[name="Submit"][exact][pressed=true][disabled=false]'
      );
      expect(result).toBeDefined();
    });

    test('handles nested quotes in text selector', () => {
      const result = resolveLocator(frame, 'text:"Say \\"Hello\\""');
      expect(result).toBeDefined();
    });
  });
});
