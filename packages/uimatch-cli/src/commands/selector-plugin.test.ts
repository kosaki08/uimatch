import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  SelectorPluginTimeoutError,
  getSelectorPluginTimeoutMs,
  resolveSelectorPluginId,
  runSelectorPluginWithTimeout,
} from './selector-plugin.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('getSelectorPluginTimeoutMs', () => {
  test('uses the default when the environment variable is absent', () => {
    expect(getSelectorPluginTimeoutMs(undefined)).toBe(30_000);
  });

  test.each(['', '0', '-1', '1.5', '100ms', ' 100 '])('rejects invalid input: %j', (value) => {
    expect(() => getSelectorPluginTimeoutMs(value)).toThrow(RangeError);
  });

  test('accepts a positive safe integer', () => {
    expect(getSelectorPluginTimeoutMs('15000')).toBe(15_000);
  });

  test('accepts the maximum Node.js timer delay', () => {
    expect(getSelectorPluginTimeoutMs('2147483647')).toBe(2_147_483_647);
  });

  test('rejects a value above the maximum Node.js timer delay', () => {
    expect(() => getSelectorPluginTimeoutMs('2147483648')).toThrow(RangeError);
  });
});

describe('resolveSelectorPluginId', () => {
  test('prefers an explicit plugin over the environment', () => {
    expect(resolveSelectorPluginId(' explicit-plugin ', 'environment-plugin', true)).toBe(
      'explicit-plugin'
    );
  });

  test('uses the default plugin only when an anchors path exists', () => {
    expect(resolveSelectorPluginId(undefined, undefined, true)).toBe('@uimatch/selector-anchors');
    expect(resolveSelectorPluginId(undefined, undefined, false)).toBeUndefined();
  });

  test('rejects a configured empty plugin ID', () => {
    expect(() => resolveSelectorPluginId(undefined, '  ', true)).toThrow(RangeError);
  });
});

describe('runSelectorPluginWithTimeout', () => {
  test('returns a result produced before the deadline', async () => {
    await expect(
      runSelectorPluginWithTimeout(() => Promise.resolve('done'), 100, 'plugin')
    ).resolves.toBe('done');
  });

  test('propagates a plugin rejection before the deadline', async () => {
    const failure = new Error('plugin failed');
    await expect(
      runSelectorPluginWithTimeout(() => Promise.reject(failure), 100, 'plugin')
    ).rejects.toBe(failure);
  });

  test('rejects when the plugin exceeds the deadline', async () => {
    vi.useFakeTimers();
    const operation = new Promise<never>(() => {});
    const result = runSelectorPluginWithTimeout(() => operation, 50, 'slow-plugin');
    const expectation = expect(result).rejects.toBeInstanceOf(SelectorPluginTimeoutError);

    await vi.advanceTimersByTimeAsync(50);

    await expectation;
  });

  test('shares one absolute deadline across sequential phases', async () => {
    vi.useFakeTimers();
    const timeoutMs = 100;
    const deadlineAt = performance.now() + timeoutMs;
    const firstPhase = runSelectorPluginWithTimeout(
      () => new Promise((resolve) => setTimeout(() => resolve('loaded'), 60)),
      timeoutMs,
      'plugin',
      deadlineAt
    );

    await vi.advanceTimersByTimeAsync(60);
    await expect(firstPhase).resolves.toBe('loaded');

    const secondPhase = runSelectorPluginWithTimeout(
      () => new Promise<never>(() => {}),
      timeoutMs,
      'plugin',
      deadlineAt
    );
    const expectation = expect(secondPhase).rejects.toBeInstanceOf(SelectorPluginTimeoutError);

    await vi.advanceTimersByTimeAsync(40);

    await expectation;
  });

  test('accepts the maximum Node.js timer delay through the programmatic API', async () => {
    await expect(
      runSelectorPluginWithTimeout(() => Promise.resolve('done'), 2_147_483_647, 'plugin')
    ).resolves.toBe('done');
  });

  test('rejects a programmatic timeout above the Node.js timer limit before starting work', async () => {
    const operation = vi.fn(() => Promise.resolve('should not run'));

    await expect(
      runSelectorPluginWithTimeout(operation, 2_147_483_648, 'plugin')
    ).rejects.toBeInstanceOf(RangeError);
    expect(operation).not.toHaveBeenCalled();
  });
});
