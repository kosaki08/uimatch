import { describe, expect, test } from 'vitest';
import { heuristicCandidates } from '../ast-fallback.js';

describe('heuristicCandidates', () => {
  test('extracts selectors through the bounded regex execution path', async () => {
    const result = await heuristicCandidates(
      '<button data-testid="save" id="save" role="button">Save</button>',
      1
    );

    expect(result.selectors).toEqual([
      '[data-testid="save"]',
      '#save',
      'role:button',
      'text:"Save"',
    ]);
  });

  test('fails closed when a heuristic regex input exceeds the limit', async () => {
    const source = `<button data-testid="target">${'a'.repeat(10_001)}</button>`;

    const result = await heuristicCandidates(source, 1);

    expect(result.level).toBe('failed');
    expect(result.selectors).toEqual([]);
  });
});
