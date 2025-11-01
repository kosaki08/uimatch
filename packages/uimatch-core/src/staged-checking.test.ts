import { describe, expect, test } from 'bun:test';
import { buildStyleDiffs } from './core/diff';
import type { ExpectedSpec } from './types';

describe('Staged Checking', () => {
  describe('Property Scope Classification', () => {
    test('classifies parent container properties as ancestor', () => {
      const actual = {
        '.container': {
          'background-color': '#ff0000',
          'border-radius': '24px',
          'padding-top': '4px',
          'padding-bottom': '4px',
          'padding-left': '4px',
          'padding-right': '4px',
          gap: '4px',
        },
      };

      const expected: ExpectedSpec = {
        '.container': {
          'background-color': '#00ff00',
          'border-radius': '8px',
          'padding-top': '16px',
          'padding-bottom': '16px',
          'padding-left': '16px',
          'padding-right': '16px',
          gap: '16px',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'all' });

      expect(diffs.length).toBeGreaterThan(0);
      const containerDiff = diffs.find((d) => d.selector === '.container');
      expect(containerDiff).toBeDefined();
      expect(containerDiff?.scope).toBe('ancestor');

      const diffsByParent = buildStyleDiffs(actual, expected, { stage: 'parent' });
      expect(diffsByParent.length).toBeGreaterThan(0);
      expect(diffsByParent.every((d) => d.scope === 'ancestor')).toBe(true);
    });

    test('classifies element properties as self', () => {
      const actual = {
        '.text': {
          color: '#000000',
          'font-size': '14px',
          'font-weight': '400',
          'line-height': '20px',
          'text-align': 'left',
        },
      };

      const expected: ExpectedSpec = {
        '.text': {
          color: '#333333',
          'font-size': '16px',
          'font-weight': '500',
          'line-height': '24px',
          'text-align': 'center',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'all' });
      expect(diffs.length).toBeGreaterThan(0);
      const textDiff = diffs.find((d) => d.selector === '.text');
      expect(textDiff?.scope).toBe('self');

      const diffsBySelf = buildStyleDiffs(actual, expected, { stage: 'self' });
      expect(diffsBySelf.length).toBeGreaterThan(0);
      expect(diffsBySelf.every((d) => d.scope === 'self')).toBe(true);
    });

    test('classifies margin properties as descendant', () => {
      const actual = {
        '.item': {
          'margin-top': '8px',
          'margin-bottom': '8px',
          'margin-left': '8px',
          'margin-right': '8px',
        },
      };

      const expected: ExpectedSpec = {
        '.item': {
          'margin-top': '12px',
          'margin-bottom': '12px',
          'margin-left': '12px',
          'margin-right': '12px',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'all' });
      expect(diffs.length).toBeGreaterThan(0);
      const itemDiff = diffs.find((d) => d.selector === '.item');
      expect(itemDiff?.scope).toBe('descendant');

      const diffsByChildren = buildStyleDiffs(actual, expected, { stage: 'children' });
      expect(diffsByChildren.length).toBeGreaterThan(0);
      expect(diffsByChildren.every((d) => d.scope === 'descendant')).toBe(true);
    });
  });

  describe('Stage-Based Filtering', () => {
    // Use separate test data for each stage to ensure clear scope dominance
    test('stage=parent returns only ancestor diffs', () => {
      const actual = {
        '.parent-container': {
          'background-color': '#ff0000',
          'border-radius': '24px',
          'padding-top': '4px',
          'padding-bottom': '4px',
          'padding-left': '4px',
          'padding-right': '4px',
          gap: '4px',
        },
      };

      const expected: ExpectedSpec = {
        '.parent-container': {
          'background-color': '#00ff00',
          'border-radius': '8px',
          'padding-top': '16px',
          'padding-bottom': '16px',
          'padding-left': '16px',
          'padding-right': '16px',
          gap: '16px',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'parent' });

      expect(diffs.length).toBeGreaterThan(0);
      diffs.forEach((diff) => {
        expect(diff.scope).toBe('ancestor');
      });
    });

    test('stage=self returns only self diffs', () => {
      const actual = {
        '.self-element': {
          color: '#000000',
          'font-size': '14px',
          'font-weight': '400',
          'line-height': '20px',
          'text-align': 'left',
        },
      };

      const expected: ExpectedSpec = {
        '.self-element': {
          color: '#333333',
          'font-size': '16px',
          'font-weight': '500',
          'line-height': '24px',
          'text-align': 'center',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'self' });

      expect(diffs.length).toBeGreaterThan(0);
      diffs.forEach((diff) => {
        expect(diff.scope).toBe('self');
      });
    });

    test('stage=children returns only descendant diffs', () => {
      const actual = {
        '.child-spacing': {
          'margin-top': '8px',
          'margin-bottom': '8px',
          'margin-left': '8px',
          'margin-right': '8px',
        },
      };

      const expected: ExpectedSpec = {
        '.child-spacing': {
          'margin-top': '12px',
          'margin-bottom': '12px',
          'margin-left': '12px',
          'margin-right': '12px',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'children' });

      expect(diffs.length).toBeGreaterThan(0);
      diffs.forEach((diff) => {
        expect(diff.scope).toBe('descendant');
      });
    });

    test('stage=all returns all diffs sorted by scope', () => {
      const actual = {
        '.mixed': {
          'background-color': '#ffffff',
          'border-radius': '8px',
          'padding-top': '16px',
          color: '#000000',
          'font-size': '14px',
          'margin-top': '8px',
        },
      };

      const expected: ExpectedSpec = {
        '.mixed': {
          'background-color': '#f0f0f0',
          'border-radius': '4px',
          'padding-top': '20px',
          color: '#333333',
          'font-size': '16px',
          'margin-top': '12px',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'all' });

      expect(diffs.length).toBeGreaterThan(0);

      // Check that diffs are sorted: ancestor → self → descendant
      const scopes = diffs.map((d) => d.scope);
      const scopeOrder = ['ancestor', 'self', 'descendant'];

      for (let i = 1; i < scopes.length; i++) {
        const prevIndex = scopeOrder.indexOf(scopes[i - 1] ?? 'self');
        const currIndex = scopeOrder.indexOf(scopes[i] ?? 'self');
        expect(currIndex).toBeGreaterThanOrEqual(prevIndex);
      }
    });

    test('default stage is all', () => {
      const actual = {
        '.test': {
          color: '#000000',
        },
      };

      const expected: ExpectedSpec = {
        '.test': {
          color: '#333333',
        },
      };

      const diffsAll = buildStyleDiffs(actual, expected, { stage: 'all' });
      const diffsDefault = buildStyleDiffs(actual, expected, {});

      expect(diffsDefault.length).toBe(diffsAll.length);
    });
  });

  describe('Dominant Scope Detection', () => {
    test('detects ancestor as dominant when most properties are container-related', () => {
      const actual = {
        '.box': {
          'background-color': '#ff0000',
          'border-radius': '24px',
          'padding-top': '4px',
          'padding-bottom': '4px',
          'padding-left': '4px',
          'padding-right': '4px',
          gap: '4px',
        },
      };

      const expected: ExpectedSpec = {
        '.box': {
          'background-color': '#00ff00',
          'border-radius': '8px',
          'padding-top': '16px',
          'padding-bottom': '16px',
          'padding-left': '16px',
          'padding-right': '16px',
          gap: '16px',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'all' });
      const boxDiff = diffs.find((d) => d.selector === '.box');

      expect(boxDiff?.scope).toBe('ancestor');
    });

    test('detects self as dominant when most properties are element-related', () => {
      const actual = {
        '.text': {
          color: '#000000',
          'font-size': '14px',
          'font-weight': '400',
          'line-height': '20px',
          'text-align': 'left',
          'letter-spacing': '0px',
          'background-color': '#ffffff', // Only one ancestor property (minority)
        },
      };

      const expected: ExpectedSpec = {
        '.text': {
          color: '#333333',
          'font-size': '16px',
          'font-weight': '500',
          'line-height': '24px',
          'text-align': 'center',
          'letter-spacing': '0.5px',
          'background-color': '#f0f0f0',
        },
      };

      const diffs = buildStyleDiffs(actual, expected, { stage: 'all' });
      const textDiff = diffs.find((d) => d.selector === '.text');

      expect(textDiff?.scope).toBe('self');
    });
  });

  describe('Progressive Validation Workflow', () => {
    test('enables progressive parent → self → children validation', () => {
      // Define separate elements with distinct scopes to test progressive validation
      const actual = {
        '.parent-container': {
          'background-color': '#ff0000',
          'border-radius': '24px',
          'padding-top': '4px',
          'padding-bottom': '4px',
          'padding-left': '4px',
          'padding-right': '4px',
          gap: '4px',
        },
        '.self-element': {
          color: '#000000',
          'font-size': '14px',
          'font-weight': '400',
          'line-height': '20px',
          'text-align': 'left',
        },
        '.child-spacing': {
          'margin-top': '4px',
          'margin-bottom': '4px',
          'margin-left': '4px',
          'margin-right': '4px',
        },
      };

      const expected: ExpectedSpec = {
        '.parent-container': {
          'background-color': '#00ff00',
          'border-radius': '8px',
          'padding-top': '16px',
          'padding-bottom': '16px',
          'padding-left': '16px',
          'padding-right': '16px',
          gap: '16px',
        },
        '.self-element': {
          color: '#333333',
          'font-size': '16px',
          'font-weight': '500',
          'line-height': '24px',
          'text-align': 'center',
        },
        '.child-spacing': {
          'margin-top': '16px',
          'margin-bottom': '16px',
          'margin-left': '16px',
          'margin-right': '16px',
        },
      };

      // Step 1: Check parent container first
      const parentDiffs = buildStyleDiffs(actual, expected, { stage: 'parent' });
      expect(parentDiffs.length).toBeGreaterThan(0);
      expect(parentDiffs.every((d) => d.scope === 'ancestor')).toBe(true);

      // Step 2: Check element itself
      const selfDiffs = buildStyleDiffs(actual, expected, { stage: 'self' });
      expect(selfDiffs.length).toBeGreaterThan(0);
      expect(selfDiffs.every((d) => d.scope === 'self')).toBe(true);

      // Step 3: Check children spacing
      const childrenDiffs = buildStyleDiffs(actual, expected, { stage: 'children' });
      expect(childrenDiffs.length).toBeGreaterThan(0);
      expect(childrenDiffs.every((d) => d.scope === 'descendant')).toBe(true);

      // All stages combined should equal 'all'
      const allDiffs = buildStyleDiffs(actual, expected, { stage: 'all' });
      expect(allDiffs.length).toBe(parentDiffs.length + selfDiffs.length + childrenDiffs.length);
    });
  });
});
