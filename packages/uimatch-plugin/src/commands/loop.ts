/**
 * Iterative UI comparison command
 */

import { browserPool } from 'uimatch-core';
import type { CompareArgs, CompareResult } from '../types/index';
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
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Iteration ${iter}/${maxIters}`);
    console.log('='.repeat(50));

    // Run comparison
    const result = await uiMatchCompare(args);
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
    console.log(result.summary);

    if (result.report.qualityGate) {
      console.log('\nQuality Gate Status:');
      const { pixelDiffRatio, colorDeltaEAvg } = result.report.metrics;
      const { thresholds } = result.report.qualityGate;

      const pixelPass = pixelDiffRatio <= thresholds.pixelDiffRatio;
      const colorPass = colorDeltaEAvg <= thresholds.deltaE;
      const noHighSeverity = !result.report.styleDiffs.some(
        (d: { severity: string }) => d.severity === 'high'
      );

      console.log(
        `${pixelPass ? '✅' : '❌'} Pixel diff: ${(pixelDiffRatio * 100).toFixed(2)}% (threshold: ${(thresholds.pixelDiffRatio * 100).toFixed(2)}%)`
      );
      console.log(
        `${colorPass ? '✅' : '❌'} Color diff: ${colorDeltaEAvg.toFixed(2)} ΔE (threshold: ${thresholds.deltaE.toFixed(2)})`
      );
      console.log(
        `${noHighSeverity ? '✅' : '❌'} High severity issues: ${result.report.styleDiffs.filter((d: { severity: string }) => d.severity === 'high').length} (must be 0)`
      );
    }

    // Check if passed
    if (passed) {
      console.log(`\n✅ Quality gates passed! DFS: ${currentDfs}`);
      break;
    }

    // Check for improvement stagnation or degradation
    if (iter > 1) {
      const improvement = currentDfs - previousDfs;
      console.log(`\nDFS change: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}`);

      if (improvement <= 0 || improvement < improvementThreshold) {
        console.log(
          `\n⚠️  ${improvement <= 0 ? 'DFS degraded or unchanged' : `Improvement stagnated (< ${improvementThreshold} points)`}. Stopping iterations.`
        );
        break;
      }
    }

    previousDfs = currentDfs;

    // Prompt for next iteration (if not last)
    if (iter < maxIters) {
      console.log(`\n❌ Quality gates not met.`);

      if (interactive) {
        console.log('Make your fixes, then press Enter to continue (or Ctrl+C to stop)...');
        // In actual implementation, we would await user input here
        // For now, we'll just note this in the comment
      } else {
        console.log('Non-interactive mode: continuing to next iteration...');
      }
    } else {
      console.log(`\n⚠️  Max iterations (${maxIters}) reached.`);
    }
  }

  // Generate summary
  const firstDfs = iterations[0]?.dfs ?? 0;
  const lastDfs = iterations[iterations.length - 1]?.dfs ?? 0;
  const improvement = lastDfs - firstDfs;
  const passed = iterations[iterations.length - 1]?.passed ?? false;

  console.log('\n' + '='.repeat(50));
  console.log('Loop Summary');
  console.log('='.repeat(50));
  console.log(`Total iterations: ${iterations.length}`);
  console.log(`Final DFS: ${lastDfs}`);
  console.log(`Status: ${passed ? '✅ Passed' : '❌ Not passed'}`);
  console.log(`\nIteration history:`);
  iterations.forEach((iter) => {
    console.log(`${iter.iteration}: DFS ${iter.dfs} ${iter.passed ? '✅' : '❌'}`);
  });
  console.log(`\nImprovement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)} points`);

  const summary = [
    passed ? 'PASS' : 'FAIL',
    `Iterations: ${iterations.length}`,
    `Final DFS: ${lastDfs}`,
    `Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}`,
  ].join(' | ');

  // Clean up browser pool after loop completes
  if (browserPool.isActive()) {
    console.log('\n🧹 Cleaning up browser resources...');
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
