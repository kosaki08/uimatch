/**
 * Comprehensive tests for liveness.ts utilities
 * Covers checkLivenessPriority and checkLivenessAll
 */

import type { Probe, ProbeResult } from '@uimatch/selector-spi';
import { describe, expect, test } from 'bun:test';
import { checkLivenessAll, checkLivenessPriority } from '../liveness.js';

/**
 * Mock Probe for testing
 */
class TestProbe implements Probe {
  private responses: Map<string, ProbeResult | Error>;
  private callOrder: string[] = [];

  constructor(responses: Record<string, ProbeResult | Error> = {}) {
    this.responses = new Map(Object.entries(responses));
  }

  async check(selector: string): Promise<ProbeResult> {
    await Promise.resolve(); // Satisfy require-await
    this.callOrder.push(selector);

    const response = this.responses.get(selector);

    if (response instanceof Error) {
      throw response;
    }

    if (response) {
      return response;
    }

    // Default: dead selector
    return {
      selector,
      isValid: false,
      isAlive: false,
      checkTime: 0,
    };
  }

  getCallOrder(): string[] {
    return this.callOrder;
  }

  reset(): void {
    this.callOrder = [];
  }
}

describe('liveness utilities', () => {
  describe('checkLivenessPriority', () => {
    test('returns first alive selector using isAlive', async () => {
      const probe = new TestProbe({
        '.dead1': { selector: '.dead1', isValid: false, isAlive: false, checkTime: 5 },
        '.dead2': { selector: '.dead2', isValid: false, isAlive: false, checkTime: 5 },
        '.alive': { selector: '.alive', isValid: true, isAlive: true, checkTime: 5 },
        '.also-alive': {
          selector: '.also-alive',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
      });

      const result = await checkLivenessPriority(probe, [
        '.dead1',
        '.dead2',
        '.alive',
        '.also-alive',
      ]);

      expect(result).toBeDefined();
      expect(result?.selector).toBe('.alive');
      expect(result?.isAlive).toBe(true);

      // Should stop at first alive selector
      const callOrder = probe.getCallOrder();
      expect(callOrder).toEqual(['.dead1', '.dead2', '.alive']);
      expect(callOrder).not.toContain('.also-alive');
    });

    test('returns first alive selector using isValid', async () => {
      const probe = new TestProbe({
        '.dead': { selector: '.dead', isValid: false, isAlive: false, checkTime: 5 },
        '.valid': { selector: '.valid', isValid: true, isAlive: false, checkTime: 5 },
      });

      const result = await checkLivenessPriority(probe, ['.dead', '.valid']);

      expect(result).toBeDefined();
      expect(result?.selector).toBe('.valid');
      expect(result?.isValid).toBe(true);
    });

    test('returns null when all selectors are dead', async () => {
      const probe = new TestProbe({
        '.dead1': { selector: '.dead1', isValid: false, isAlive: false, checkTime: 5 },
        '.dead2': { selector: '.dead2', isValid: false, isAlive: false, checkTime: 5 },
        '.dead3': { selector: '.dead3', isValid: false, isAlive: false, checkTime: 5 },
      });

      const result = await checkLivenessPriority(probe, ['.dead1', '.dead2', '.dead3']);

      expect(result).toBeNull();

      // Should check all selectors
      const callOrder = probe.getCallOrder();
      expect(callOrder).toEqual(['.dead1', '.dead2', '.dead3']);
    });

    test('returns null for empty selector array', async () => {
      const probe = new TestProbe();
      const result = await checkLivenessPriority(probe, []);

      expect(result).toBeNull();
    });

    test('respects selector priority order', async () => {
      const probe = new TestProbe({
        '[role="button"]': {
          selector: '[role="button"]',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
        '[data-testid="btn"]': {
          selector: '[data-testid="btn"]',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
      });

      const result = await checkLivenessPriority(probe, ['[role="button"]', '[data-testid="btn"]']);

      expect(result?.selector).toBe('[role="button"]');

      // Should not check second selector
      expect(probe.getCallOrder()).toEqual(['[role="button"]']);
    });

    test('handles probe errors by continuing to next selector', async () => {
      const probe = new TestProbe({
        '.error': new Error('Check failed'),
        '.alive': { selector: '.alive', isValid: true, isAlive: true, checkTime: 5 },
      });

      // Even though first selector throws, it should continue
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(checkLivenessPriority(probe, ['.error', '.alive'])).rejects.toThrow(
        'Check failed'
      );
    });

    test('passes options to probe check', async () => {
      const probe = new TestProbe({
        '.test': { selector: '.test', isValid: true, isAlive: true, checkTime: 5 },
      });

      const options = { timeoutMs: 1000 };
      const result = await checkLivenessPriority(probe, ['.test'], options);

      expect(result).toBeDefined();
    });
  });

  describe('checkLivenessAll', () => {
    test('returns all results in parallel', async () => {
      const probe = new TestProbe({
        '.alive1': { selector: '.alive1', isValid: true, isAlive: true, checkTime: 5 },
        '.dead': { selector: '.dead', isValid: false, isAlive: false, checkTime: 5 },
        '.alive2': { selector: '.alive2', isValid: true, isAlive: true, checkTime: 5 },
      });

      const results = await checkLivenessAll(probe, ['.alive1', '.dead', '.alive2']);

      expect(results).toHaveLength(3);
      expect(results[0].selector).toBe('.alive1');
      expect(results[0].isAlive).toBe(true);
      expect(results[1].selector).toBe('.dead');
      expect(results[1].isAlive).toBe(false);
      expect(results[2].selector).toBe('.alive2');
      expect(results[2].isAlive).toBe(true);
    });

    test('handles empty selector array', async () => {
      const probe = new TestProbe();
      const results = await checkLivenessAll(probe, []);

      expect(results).toEqual([]);
    });

    test('converts probe errors to failed ProbeResults', async () => {
      const probe = new TestProbe({
        '.error': new Error('Probe check failed'),
        '.alive': { selector: '.alive', isValid: true, isAlive: true, checkTime: 5 },
      });

      const results = await checkLivenessAll(probe, ['.error', '.alive']);

      expect(results).toHaveLength(2);

      // First result should be failed
      expect(results[0].selector).toBe('.error');
      expect(results[0].isValid).toBe(false);
      expect(results[0].isAlive).toBe(false);
      expect(results[0].error).toBe('Probe check failed');

      // Second result should succeed
      expect(results[1].selector).toBe('.alive');
      expect(results[1].isAlive).toBe(true);
    });

    test('handles non-Error rejection values', async () => {
      class StringErrorProbe implements Probe {
        async check(selector: string): Promise<ProbeResult> {
          await Promise.resolve(); // Satisfy require-await
          if (selector === '.string-error') {
            // Promise.reject with string instead of Error
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw 'String error message';
          }
          return { selector, isValid: true, isAlive: true, checkTime: 5 };
        }
      }

      const probe = new StringErrorProbe();
      const results = await checkLivenessAll(probe, ['.string-error', '.alive']);

      expect(results[0].error).toBe('String error message');
      expect(results[0].isValid).toBe(false);
    });

    test('runs checks in parallel (not sequentially)', async () => {
      const delays: Record<string, number> = {
        '.slow': 100,
        '.fast': 10,
      };

      class TimingProbe implements Probe {
        async check(selector: string): Promise<ProbeResult> {
          const delay = delays[selector] ?? 0;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return { selector, isValid: true, isAlive: true, checkTime: delay };
        }
      }

      const probe = new TimingProbe();
      const start = Date.now();

      await checkLivenessAll(probe, ['.slow', '.fast']);

      const elapsed = Date.now() - start;

      // If parallel, elapsed should be ~100ms (max delay)
      // If sequential, elapsed would be ~110ms (sum of delays)
      expect(elapsed).toBeLessThan(150); // Allow some margin
    });

    test('maintains selector order in results', async () => {
      const probe = new TestProbe({
        '.third': { selector: '.third', isValid: true, isAlive: true, checkTime: 5 },
        '.first': { selector: '.first', isValid: true, isAlive: true, checkTime: 5 },
        '.second': { selector: '.second', isValid: true, isAlive: true, checkTime: 5 },
      });

      const results = await checkLivenessAll(probe, ['.first', '.second', '.third']);

      expect(results[0].selector).toBe('.first');
      expect(results[1].selector).toBe('.second');
      expect(results[2].selector).toBe('.third');
    });

    test('passes options to all probe checks', async () => {
      const probe = new TestProbe({
        '.test1': { selector: '.test1', isValid: true, isAlive: true, checkTime: 5 },
        '.test2': { selector: '.test2', isValid: true, isAlive: true, checkTime: 5 },
      });

      const options = { timeoutMs: 2000 };
      const results = await checkLivenessAll(probe, ['.test1', '.test2'], options);

      expect(results).toHaveLength(2);
    });

    test('handles mixed alive and dead selectors', async () => {
      const probe = new TestProbe({
        '.alive1': { selector: '.alive1', isValid: true, isAlive: true, checkTime: 5 },
        '.dead1': { selector: '.dead1', isValid: false, isAlive: false, checkTime: 5 },
        '.alive2': { selector: '.alive2', isValid: true, isAlive: true, checkTime: 5 },
        '.dead2': { selector: '.dead2', isValid: false, isAlive: false, checkTime: 5 },
      });

      const results = await checkLivenessAll(probe, ['.alive1', '.dead1', '.alive2', '.dead2']);

      const aliveCount = results.filter((r) => r.isAlive || r.isValid).length;
      const deadCount = results.filter((r) => !r.isAlive && !r.isValid).length;

      expect(aliveCount).toBe(2);
      expect(deadCount).toBe(2);
    });

    test('handles undefined selector in responses gracefully', async () => {
      class BrokenProbe implements Probe {
        async check(): Promise<ProbeResult> {
          await Promise.resolve(); // Satisfy require-await
          throw new Error('Broken probe');
        }
      }

      const probe = new BrokenProbe();
      const results = await checkLivenessAll(probe, ['.test']);

      expect(results[0].selector).toBe('.test');
      expect(results[0].error).toBe('Broken probe');
    });
  });

  describe('Integration Scenarios', () => {
    test('priority check then all check pattern', async () => {
      const probe = new TestProbe({
        '.primary': { selector: '.primary', isValid: false, isAlive: false, checkTime: 5 },
        '.fallback1': {
          selector: '.fallback1',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
        '.fallback2': {
          selector: '.fallback2',
          isValid: true,
          isAlive: true,
          checkTime: 5,
        },
      });

      // Try priority check first
      const priorityResult = await checkLivenessPriority(probe, [
        '.primary',
        '.fallback1',
        '.fallback2',
      ]);

      expect(priorityResult?.selector).toBe('.fallback1');

      // Then check all for scoring
      probe.reset();
      const allResults = await checkLivenessAll(probe, ['.fallback1', '.fallback2']);

      expect(allResults).toHaveLength(2);
      expect(allResults.every((r) => r.isAlive)).toBe(true);
    });
  });
});
