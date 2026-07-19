import { afterEach, describe, expect, test, vi } from 'vitest';
import { withTimeout } from './async.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withTimeout', () => {
  test('returns a resolved value and clears the timer', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const result = await withTimeout(Promise.resolve('done'), 10_000);

    expect(result).toBe('done');
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  test('propagates a rejection before the timeout and clears the timer', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const error = new Error('operation failed');

    let caught: unknown;
    try {
      await withTimeout(Promise.reject(error), 10_000);
    } catch (reason) {
      caught = reason;
    }

    expect(caught).toBe(error);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  test('returns null when the timeout wins', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const pending = new Promise<never>(() => {});

    const result = await withTimeout(pending, 1);

    expect(result).toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  test.each([0, -1])('treats timeoutMs=%p as an immediate timeout', async (timeoutMs) => {
    const result = await withTimeout(Promise.resolve('too late'), timeoutMs);

    expect(result).toBeNull();
  });

  test('observes a rejection after an immediate timeout', async () => {
    let rejectOperation: (reason: Error) => void = () => {};
    const operation = new Promise<never>((_resolve, reject) => {
      rejectOperation = reject;
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const result = await withTimeout(operation, 0);
      rejectOperation(new Error('late rejection'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result).toBeNull();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
