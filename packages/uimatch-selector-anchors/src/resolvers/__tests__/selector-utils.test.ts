import { describe, expect, test } from 'bun:test';
import { calculateSpecificityScore } from '../selector-utils.js';

describe('calculateSpecificityScore', () => {
  describe('ID selectors', () => {
    test('correctly scores #id selector', () => {
      expect(calculateSpecificityScore('#foo')).toBe(100);
    });

    test('correctly scores button#id selector', () => {
      expect(calculateSpecificityScore('button#foo')).toBe(101); // tag(1) + id(100)
    });

    test('correctly scores multiple IDs', () => {
      expect(calculateSpecificityScore('#foo #bar')).toBe(200); // id(100) + id(100)
    });

    test('does not count # inside attribute selector', () => {
      // [href="#section"] should not count the # as ID
      expect(calculateSpecificityScore('[href="#section"]')).toBe(10); // attr(10)
    });
  });

  describe('data-testid selectors', () => {
    test('correctly scores data-testid attribute', () => {
      expect(calculateSpecificityScore('[data-testid="foo"]')).toBe(110); // testid(100) + attr(10)
    });

    test('data-testid has same priority as ID', () => {
      const testidScore = calculateSpecificityScore('[data-testid="foo"]');
      const idScore = calculateSpecificityScore('#foo');
      // Both should have base 100, but testid has +10 from attribute selector
      expect(testidScore).toBeGreaterThanOrEqual(idScore);
    });
  });

  describe('role selectors', () => {
    test('correctly scores simple role', () => {
      expect(calculateSpecificityScore('role:button')).toBe(80);
    });

    test('correctly scores role with options', () => {
      expect(calculateSpecificityScore('role:button[name="Submit"]')).toBe(85); // role(80) + option(5)
    });

    test('correctly scores role with multiple options', () => {
      expect(calculateSpecificityScore('role:checkbox[checked=true][disabled=false]')).toBe(90); // role(80) + 2*option(5)
    });
  });

  describe('class selectors', () => {
    test('correctly scores single class', () => {
      expect(calculateSpecificityScore('.btn')).toBe(10);
    });

    test('correctly scores multiple classes', () => {
      expect(calculateSpecificityScore('.btn.primary')).toBe(20); // class(10) + class(10)
    });

    test('correctly scores button.class selector', () => {
      expect(calculateSpecificityScore('button.btn')).toBe(11); // tag(1) + class(10)
    });
  });

  describe('attribute selectors', () => {
    test('correctly scores attribute selector', () => {
      expect(calculateSpecificityScore('[type="text"]')).toBe(10);
    });

    test('correctly scores multiple attributes', () => {
      expect(calculateSpecificityScore('[type="text"][name="username"]')).toBe(20);
    });

    test('correctly scores tag with attribute', () => {
      expect(calculateSpecificityScore('input[type="text"]')).toBe(11); // tag(1) + attr(10)
    });
  });

  describe('pseudo-class selectors', () => {
    test('correctly scores pseudo-class', () => {
      expect(calculateSpecificityScore(':checked')).toBe(10);
    });

    test('correctly scores multiple pseudo-classes', () => {
      expect(calculateSpecificityScore(':checked:disabled')).toBe(20);
    });

    test('correctly scores button:hover', () => {
      expect(calculateSpecificityScore('button:hover')).toBe(11); // tag(1) + pseudo(10)
    });

    test('does not count role: prefix as pseudo-class', () => {
      expect(calculateSpecificityScore('role:button')).toBe(80); // only role score, no pseudo
    });
  });

  describe('text selectors', () => {
    test('correctly scores text selector', () => {
      expect(calculateSpecificityScore('text:"Submit"')).toBe(0); // text has no CSS specificity
    });
  });

  describe('tag selectors', () => {
    test('correctly scores simple tag', () => {
      expect(calculateSpecificityScore('button')).toBe(1);
    });

    test('correctly scores tag with combinator', () => {
      expect(calculateSpecificityScore('div > button')).toBe(2); // div(1) + button(1)
    });
  });

  describe('complex selectors', () => {
    test('correctly scores complex selector', () => {
      // button#submit.primary[type="submit"]:hover
      // id(100) + class(10) + attr(10) + pseudo(10) + tag(1) = 131
      expect(calculateSpecificityScore('button#submit.primary[type="submit"]:hover')).toBe(131);
    });

    test('correctly scores role with CSS fallback', () => {
      // button#foo:checked combined selector
      expect(calculateSpecificityScore('button#foo:checked')).toBe(111); // tag(1) + id(100) + pseudo(10)
    });
  });

  describe('edge cases', () => {
    test('handles empty selector', () => {
      expect(calculateSpecificityScore('')).toBe(0);
    });

    test('handles wildcard selector', () => {
      expect(calculateSpecificityScore('*')).toBe(0);
    });

    test('handles descendant combinator', () => {
      expect(calculateSpecificityScore('.parent .child')).toBe(20); // class(10) + class(10)
    });
  });
});
