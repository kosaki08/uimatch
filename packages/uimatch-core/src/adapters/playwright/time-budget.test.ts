/**
 * Unit tests for time-budget utilities
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { createTimeBudget, getE2ETimeBudget } from './time-budget';

describe('createTimeBudget', () => {
  let dateNowSpy: ReturnType<typeof spyOn<typeof Date.now>> | null = null;
  let mockTime = 0;

  beforeEach(() => {
    mockTime = 1000000;
    dateNowSpy = spyOn(Date, 'now').mockImplementation(() => mockTime);
  });

  afterEach(() => {
    if (dateNowSpy) {
      dateNowSpy.mockRestore();
    }
  });

  test('returns full budget initially', () => {
    const budget = createTimeBudget(5000);
    expect(budget.remaining()).toBe(5000);
  });

  test('tracks elapsed time correctly', () => {
    const budget = createTimeBudget(5000);

    // Advance time by 1000ms
    mockTime += 1000;

    expect(budget.remaining()).toBe(4000);
  });

  test('tracks consumed time from operations', () => {
    const budget = createTimeBudget(5000);

    // Complete an operation that took 1500ms
    budget.completeOperation(1500);

    expect(budget.remaining()).toBe(3500);
  });

  test('combines elapsed and consumed time', () => {
    const budget = createTimeBudget(5000);

    // Advance time by 1000ms
    mockTime += 1000;

    // Complete an operation that took 1500ms
    budget.completeOperation(1500);

    expect(budget.remaining()).toBe(2500);
  });

  test('never returns negative remaining time', () => {
    const budget = createTimeBudget(1000);

    // Advance time beyond budget
    mockTime += 2000;

    expect(budget.remaining()).toBe(0);
  });

  test('allocate returns ideal timeout when sufficient budget', () => {
    const budget = createTimeBudget(10000);

    const timeout = budget.allocate(3000);

    expect(timeout).toBe(3000);
  });

  test('allocate respects safety margin', () => {
    const budget = createTimeBudget(5000);

    // Default safety margin is 500ms
    // remaining = 5000, maxAllowed = 5000 - 500 = 4500
    const timeout = budget.allocate(6000);

    expect(timeout).toBe(4500);
  });

  test('allocate uses custom safety margin', () => {
    const budget = createTimeBudget(5000);

    // Custom safety margin of 1000ms
    // remaining = 5000, maxAllowed = 5000 - 1000 = 4000
    const timeout = budget.allocate(6000, 1000);

    expect(timeout).toBe(4000);
  });

  test('allocate returns minimum timeout when budget is low', () => {
    const budget = createTimeBudget(5000);

    // Consume most of the budget
    mockTime += 4700;

    // remaining = 300, maxAllowed = 300 - 500 = -200 (< 500)
    // Should return Math.max(100, -200) = 100
    const timeout = budget.allocate(1000);

    expect(timeout).toBe(100);
  });

  test('allocate returns remaining when close to limit', () => {
    const budget = createTimeBudget(5000);

    // Consume most of the budget
    mockTime += 4400;

    // remaining = 600, maxAllowed = 600 - 500 = 100 (< 500)
    // Should return Math.max(100, 100) = 100
    const timeout = budget.allocate(1000);

    expect(timeout).toBe(100);
  });

  test('startOperation is a no-op', () => {
    const budget = createTimeBudget(5000);

    budget.startOperation();

    // Should not affect remaining time
    expect(budget.remaining()).toBe(5000);
  });

  test('multiple operations accumulate consumed time', () => {
    const budget = createTimeBudget(10000);

    budget.completeOperation(1000);
    budget.completeOperation(2000);
    budget.completeOperation(1500);

    expect(budget.remaining()).toBe(5500);
  });

  test('realistic scenario: multiple operations with time elapsed', () => {
    const budget = createTimeBudget(8000);

    // First operation
    budget.startOperation();
    mockTime += 500;
    budget.completeOperation(500);

    // Second operation
    budget.startOperation();
    mockTime += 800;
    budget.completeOperation(800);

    // Check timeout for next operation
    const timeout = budget.allocate(3000);

    // remaining = 8000 - 1300 (elapsed) - 1300 (consumed) = 5400
    // maxAllowed = 5400 - 500 = 4900
    // Should return min(3000, 4900) = 3000
    expect(budget.remaining()).toBe(5400);
    expect(timeout).toBe(3000);
  });
});

describe('getE2ETimeBudget', () => {
  const originalEnv = process.env.UIMATCH_E2E_TIME_BUDGET_MS;

  afterEach(() => {
    // Restore original env var
    if (originalEnv !== undefined) {
      process.env.UIMATCH_E2E_TIME_BUDGET_MS = originalEnv;
    } else {
      delete process.env.UIMATCH_E2E_TIME_BUDGET_MS;
    }
  });

  test('returns default value when env var is not set', () => {
    delete process.env.UIMATCH_E2E_TIME_BUDGET_MS;

    expect(getE2ETimeBudget()).toBe(8000);
  });

  test('returns env var value when set', () => {
    process.env.UIMATCH_E2E_TIME_BUDGET_MS = '10000';

    expect(getE2ETimeBudget()).toBe(10000);
  });

  test('returns default when env var is not a number', () => {
    process.env.UIMATCH_E2E_TIME_BUDGET_MS = 'invalid';

    expect(getE2ETimeBudget()).toBe(8000);
  });

  test('returns default when env var is negative', () => {
    process.env.UIMATCH_E2E_TIME_BUDGET_MS = '-1000';

    expect(getE2ETimeBudget()).toBe(8000);
  });

  test('returns default when env var is zero', () => {
    process.env.UIMATCH_E2E_TIME_BUDGET_MS = '0';

    expect(getE2ETimeBudget()).toBe(8000);
  });

  test('accepts valid positive values', () => {
    process.env.UIMATCH_E2E_TIME_BUDGET_MS = '15000';

    expect(getE2ETimeBudget()).toBe(15000);
  });

  test('handles decimal values by converting to integer', () => {
    process.env.UIMATCH_E2E_TIME_BUDGET_MS = '5000.5';

    expect(getE2ETimeBudget()).toBe(5000.5);
  });
});
