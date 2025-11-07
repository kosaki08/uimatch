/**
 * Iterative UI comparison command
 */

import type { CompareArgs, CompareResult } from '#plugin/types/index';
import { browserPool } from 'uimatch-core';
import { outln } from '../cli/print.js';
import { uiMatchCompare } from './compare';

/**
 * Loop-specific arguments extending CompareArgs
 */
export interface LoopArgs extends CompareArgs {
  /**
   * Maximum number of iterations
   * @default 5
   */
  maxIters?: number;

  /**
   * Stop if DFS improvement between iterations is below this threshold
   * @default 0.5
   */
  improvementThreshold?: number;

  /**
   * Whether to wait for user input between iterations
   * @default false
   */
  interactive?: boolean;
}

/**
 * Result of loop comparison
 */
export interface LoopResult {
  /**
   * Summary of all iterations
   */
  summary: string;

  /**
   * Detailed loop report
   */
  report: {
    /**
     * Total number of iterations executed
     */
    totalIterations: number;

    /**
     * Whether quality gates passed
     */
    passed: boolean;

    /**
     * DFS improvement from first to last iteration
     */
    improvement: number;

    /**
     * Results from each iteration
     */
    iterations: Array<{
      iteration: number;
      dfs: number;
      passed: boolean;
      summary: string;
    }>;

    /**
     * Final iteration result
     */
    final: CompareResult['report'];
  };
}

/**
 * Performs iterative comparison with quality gates and automatic retry.
 *
 * @param args - Loop parameters
 * @returns Summary and iteration history
 *
 * @example
 * ```typescript
 * const result = await uiMatchLoop({
 *   figma: 'abc123:1-2',
 *   story: 'http://localhost:6006/?path=/story/button',
 *   selector: '#root button',
 *   maxIters: 5,
 * });
 * ```
 */
export async function uiMatchLoop(args: LoopArgs): Promise<LoopResult> {
  const maxIters = args.maxIters ?? 5;
  const improvementThreshold = args.improvementThreshold ?? 0.5;
  const interactive = args.interactive ?? false;

  const iterations: LoopResult['report']['iterations'] = [];
  let previousDfs = 0;
  let finalResult: CompareResult | null = null;

  for (let iter = 1; iter <= maxIters; iter++) {
    process.stdout.write(`\n${'='.repeat(50)}`);
    process.stdout.write(`Iteration ${iter}/${maxIters}` + '\n');
    process.stdout.write('='.repeat(50) + '\n');

    // Run comparison with browser reuse enabled
    const result = await uiMatchCompare({ ...args, reuseBrowser: true });
    finalResult = result;

    const currentDfs = result.report.metrics.dfs;
    const passed = result.report.qualityGate?.pass ?? false;

    // Store iteration result
    iterations.push({
      iteration: iter,
      dfs: currentDfs,
      passed,
      summary: result.summary,
    });

    // Display results
    process.stdout.write(result.summary + '\n');

    if (result.report.qualityGate) {
      process.stdout.write('\nQuality Gate Status:');
      const { pixelDiffRatio, colorDeltaEAvg } = result.report.metrics;
      const { thresholds } = result.report.qualityGate;

      const pixelPass = pixelDiffRatio <= thresholds.pixelDiffRatio;
      const colorPass = colorDeltaEAvg <= thresholds.deltaE;
      const noHighSeverity = !result.report.styleDiffs.some(
        (d: { severity: string }) => d.severity === 'high'
      );

      outln(
        `${pixelPass ? '✅' : '❌'} Pixel diff: ${(pixelDiffRatio * 100).toFixed(2)}% (threshold: ${(thresholds.pixelDiffRatio * 100).toFixed(2)}%)`
      );
      outln(
        `${colorPass ? '✅' : '❌'} Color diff: ${colorDeltaEAvg.toFixed(2)} ΔE (threshold: ${thresholds.deltaE.toFixed(2)})`
      );
      outln(
        `${noHighSeverity ? '✅' : '❌'} High severity issues: ${result.report.styleDiffs.filter((d: { severity: string }) => d.severity === 'high').length} (must be 0)`
      );
    }

    // Check if passed
    if (passed) {
      process.stdout.write(`\n✅ Quality gates passed! DFS: ${currentDfs}`);
      break;
    }

    // Check for improvement stagnation or degradation
    if (iter > 1) {
      const improvement = currentDfs - previousDfs;
      process.stdout.write(`\nDFS change: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}`);

      if (improvement <= 0 || improvement < improvementThreshold) {
        outln(
          `\n⚠️  ${improvement <= 0 ? 'DFS degraded or unchanged' : `Improvement stagnated (< ${improvementThreshold} points)`}. Stopping iterations.`
        );
        break;
      }
    }

    previousDfs = currentDfs;

    // Prompt for next iteration (if not last)
    if (iter < maxIters) {
      process.stdout.write(`\n❌ Quality gates not met.`);

      if (interactive) {
        process.stdout.write(
          'Make your fixes, then press Enter to continue (or Ctrl+C to stop)...' + '\n'
        );
        // In actual implementation, we would await user input here
        // For now, we'll just note this in the comment
      } else {
        process.stdout.write('Non-interactive mode: continuing to next iteration...' + '\n');
      }
    } else {
      process.stdout.write(`\n⚠️  Max iterations (${maxIters}) reached.`);
    }
  }

  // Generate summary
  const firstDfs = iterations[0]?.dfs ?? 0;
  const lastDfs = iterations[iterations.length - 1]?.dfs ?? 0;
  const improvement = lastDfs - firstDfs;
  const passed = iterations[iterations.length - 1]?.passed ?? false;

  process.stdout.write('\n' + '='.repeat(50));
  process.stdout.write('Loop Summary' + '\n');
  process.stdout.write('='.repeat(50) + '\n');
  process.stdout.write(`Total iterations: ${iterations.length}` + '\n');
  process.stdout.write(`Final DFS: ${lastDfs}` + '\n');
  process.stdout.write(`Status: ${passed ? '✅ Passed' : '❌ Not passed'}` + '\n');
  process.stdout.write(`\nIteration history:`);
  iterations.forEach((iter) => {
    process.stdout.write(`${iter.iteration}: DFS ${iter.dfs} ${iter.passed ? '✅' : '❌'}` + '\n');
  });
  process.stdout.write(
    `\nImprovement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)} points`
  );

  const summary = [
    passed ? 'PASS' : 'FAIL',
    `Iterations: ${iterations.length}`,
    `Final DFS: ${lastDfs}`,
    `Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}`,
  ].join(' | ');

  // Clean up browser pool after loop completes
  if (browserPool.isActive()) {
    process.stdout.write('\n🧹 Cleaning up browser resources...');
    await browserPool.closeAll();
  }

  if (!finalResult) {
    throw new Error('No iterations completed');
  }

  return {
    summary,
    report: {
      totalIterations: iterations.length,
      passed,
      improvement,
      iterations,
      final: finalResult.report,
    },
  };
}
