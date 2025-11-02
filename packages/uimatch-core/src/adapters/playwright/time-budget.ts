/**
 * Time budget management for E2E tests
 * Prevents timeout accumulation by dynamically adjusting operation timeouts
 */

export interface TimeBudget {
  /**
   * Get the remaining time budget in milliseconds
   */
  remaining(): number;

  /**
   * Calculate a safe timeout for an operation, ensuring it doesn't exceed remaining budget
   * @param idealTimeout - The ideal timeout for this operation
   * @param safetyMargin - Margin to keep (default: 500ms)
   * @returns Adjusted timeout value
   */
  allocate(idealTimeout: number, safetyMargin?: number): number;

  /**
   * Record that an operation has started
   */
  startOperation(): void;

  /**
   * Record that an operation has completed
   * @param durationMs - Duration of the operation in milliseconds
   */
  completeOperation(durationMs: number): void;
}

/**
 * Creates a time budget tracker
 * @param totalBudgetMs - Total time budget in milliseconds
 * @returns TimeBudget instance
 */
export function createTimeBudget(totalBudgetMs: number): TimeBudget {
  const startTime = Date.now();
  let consumedTime = 0;

  return {
    remaining(): number {
      const elapsed = Date.now() - startTime;
      return Math.max(0, totalBudgetMs - elapsed - consumedTime);
    },

    allocate(idealTimeout: number, safetyMargin = 500): number {
      const remaining = this.remaining();
      const maxAllowed = remaining - safetyMargin;

      // If remaining time is too low, return minimum viable timeout
      if (maxAllowed < 500) {
        return Math.max(100, maxAllowed);
      }

      // Return the smaller of ideal timeout and remaining budget
      return Math.min(idealTimeout, maxAllowed);
    },

    startOperation(): void {
      // No-op for now, could be used for tracking
    },

    completeOperation(durationMs: number): void {
      consumedTime += durationMs;
    },
  };
}

/**
 * Get the E2E time budget from environment variable or use default
 * @returns Time budget in milliseconds
 */
export function getE2ETimeBudget(): number {
  const envValue = process.env.UIMATCH_E2E_TIME_BUDGET_MS;
  if (envValue) {
    const parsed = Number(envValue);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  // Default: 8 seconds (conservative for 10s test timeout)
  return 8000;
}
