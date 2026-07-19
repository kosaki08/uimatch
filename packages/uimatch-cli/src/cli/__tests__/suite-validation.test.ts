import { browserPool } from '@uimatch/core';
import { afterEach, expect, test, vi } from 'vitest';
import { runSuite, runWithConcurrency } from '../suite';

afterEach(() => {
  vi.restoreAllMocks();
});

test.each([0, -1, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'runWithConcurrency rejects invalid internal limit %p',
  async (limit) => {
    let rejection: unknown;
    try {
      await runWithConcurrency([1], limit, (value) => Promise.resolve(value));
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(RangeError);
    expect((rejection as Error).message).toBe('Concurrency limit must be a positive safe integer');
  }
);

test('runWithConcurrency preserves item order', async () => {
  const results = await runWithConcurrency([3, 1, 2], 2, (value) => Promise.resolve(value * 2));

  expect(results).toEqual([6, 2, 4]);
});

test('runSuite closes the browser pool on a usage error', async () => {
  const closeAll = vi.spyOn(browserPool, 'closeAll').mockResolvedValue();

  const exitCode = await runSuite([]);

  expect(exitCode).toBe(2);
  expect(closeAll).toHaveBeenCalledTimes(1);
});
