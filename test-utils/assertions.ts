import { expect } from 'vitest';

export function expectSingle<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) {
    throw new Error('Expected exactly one item');
  }
  return item;
}
