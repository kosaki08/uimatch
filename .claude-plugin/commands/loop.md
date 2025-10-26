---
name: 'uiMatch Loop'
description: 'Iterative comparison with quality gates and automatic retry'
version: '0.1.0'
dependencies: 'Node.js >=22.11.0, Playwright, Figma MCP server'
---

# uiMatch Loop Command

This command performs iterative design-to-implementation comparisons, repeating the comparison up to a maximum number of iterations or until quality thresholds are met.

## Trigger Conditions

Use this command when:

- User wants to iteratively fix design issues and re-check
- User requests "keep comparing until it passes"
- User mentions quality gates or acceptance criteria
- After an initial `/uiMatch compare` shows DFS < 90 and user wants to iterate

## Prerequisites

- Same as `/uiMatch compare`
- **Quality thresholds** defined (defaults: `pixelDiffRatio ≤ 0.03`, `deltaE ≤ 3.0`, no high-severity diffs)
- **Editable implementation** (user can make changes between iterations)

## Execution Steps

1. **Parse loop parameters**:
   - All parameters from `/uiMatch compare`
   - `maxIters`: Maximum iterations (default: 5)
   - `thresholds`: Quality gate thresholds

2. **Run comparison loop**:

   ```typescript
   import { uiMatchCompare } from 'uimatch-plugin';

   const maxIters = 5;
   const thresholds = {
     pixelDiffRatio: 0.03,
     deltaE: 3.0,
   };

   for (let iter = 1; iter <= maxIters; iter++) {
     console.log(`\nIteration ${iter}/${maxIters}`);

     const result = await uiMatchCompare({
       figma: '<fileKey>:<nodeId>',
       story: '<target-url>',
       selector: '<css-selector>',
       thresholds,
     });

     console.log(result.summary);

     // Check quality gates
     const passPixel = result.report.metrics.pixelDiffRatio <= thresholds.pixelDiffRatio;
     const passColor = result.report.metrics.colorDeltaEAvg <= thresholds.deltaE;
     const noHighSeverity = !result.report.styleDiffs.some((d) => d.severity === 'high');

     if (passPixel && passColor && noHighSeverity) {
       console.log(`✅ Quality gates passed! DFS: ${result.report.metrics.dfs}`);
       break;
     }

     if (iter < maxIters) {
       console.log(`\n❌ Quality gates not met. Waiting for fixes...`);
       console.log(`Press Enter when ready for next iteration, or Ctrl+C to stop.`);
       // Pause for user to make changes
       await waitForUserInput();
     } else {
       console.log(`\n⚠️  Max iterations reached. Final DFS: ${result.report.metrics.dfs}`);
     }
   }
   ```

3. **Report iteration summary**:
   - Show DFS trend across iterations
   - Highlight improvements or regressions
   - List remaining issues

## Usage Examples

### Example 1: Basic Loop with Default Settings

**User input**:
"Keep comparing until the design matches. Fix issues iteratively."

**Execution**:

```typescript
// Run up to 5 iterations with default thresholds
for (let i = 1; i <= 5; i++) {
  const result = await uiMatchCompare({
    figma: 'abc:1-2',
    story: 'http://localhost:6006/button',
    selector: '#button',
  });

  // Check if passed
  if (result.report.metrics.dfs >= 95) {
    console.log('✅ Design fidelity achieved!');
    break;
  }

  // Prompt user to fix and continue
}
```

**Output**:

```
Iteration 1/5
DFS: 87 | pixelDiffRatio: 2.34% | colorDeltaEAvg: 1.20 | styleDiffs: 3 (high: 1)

Issues to fix:
1. [high] color: Use var(--color-primary) instead of #1a73e8
2. [medium] font-size: Change to 16px

Press Enter when ready for next iteration...

Iteration 2/5
DFS: 95 | pixelDiffRatio: 0.8% | colorDeltaEAvg: 0.5 | styleDiffs: 1 (high: 0)

✅ Quality gates passed! DFS: 95
```

### Example 2: Custom Thresholds

**User input**:
"Loop with strict thresholds: pixel diff < 1%, color diff < 1.5"

**Execution**:

```typescript
const thresholds = {
  pixelDiffRatio: 0.01,
  deltaE: 1.5,
};

// Run loop with custom thresholds
```

### Example 3: Non-Interactive Mode (CI/CD)

For automated environments, skip user input pauses:

```typescript
const results = [];
for (let i = 1; i <= maxIters; i++) {
  const result = await uiMatchCompare({ ... });
  results.push({
    iteration: i,
    dfs: result.report.metrics.dfs,
    passed: checkQualityGates(result)
  });

  if (results[i-1].passed) break;
}

// Generate iteration report
console.log('Iteration Summary:');
results.forEach(r => {
  console.log(`${r.iteration}: DFS ${r.dfs} ${r.passed ? '✅' : '❌'}`);
});
```

## Quality Gates

Default quality gates (all must pass):

1. **Pixel difference ratio** ≤ 3% (0.03)
2. **Color delta E average** ≤ 3.0
3. **No high-severity style diffs**

### Customizing Quality Gates

Users can override thresholds:

```typescript
thresholds: {
  pixelDiffRatio: 0.02,  // 2% max pixel diff
  deltaE: 2.0            // Stricter color matching
}
```

## Stop Conditions

The loop stops when:

1. **Quality gates pass** - All thresholds met ✅
2. **Max iterations reached** - Hit `maxIters` limit ⚠️
3. **No improvement** - DFS change < 1 between iterations (optional)
4. **User cancels** - Ctrl+C or explicit stop request

## Error Handling

### Same issues persist across iterations

**Problem**: User sees the same style diffs in multiple iterations

**Solution**:

1. Check that code changes were saved and server reloaded
2. Verify browser cache is cleared (Playwright uses headless mode, should not cache)
3. Try a hard refresh or restart of the target server

### Infinite loop risk

**Problem**: User concerned about infinite loops

**Solution**:

- Always set `maxIters` (default: 5, max recommended: 10)
- Implement improvement threshold check (stop if DFS doesn't improve by at least 1 point)

## Output Format

Per-iteration output:

```
Iteration 1/5
──────────────────────────────────────
DFS: 87 | pixelDiffRatio: 2.34% | colorDeltaEAvg: 1.20 | styleDiffs: 3 (high: 1)

Top issues:
1. [high] color: ...
2. [medium] font-size: ...

Quality gate status:
✅ Pixel diff: 2.34% (threshold: 3%)
✅ Color diff: 1.20 ΔE (threshold: 3.0)
❌ High severity issues: 1 (must be 0)

Press Enter when ready for next iteration...
```

Final summary:

```
Loop Summary
──────────────────────────────────────
Total iterations: 3
Final DFS: 98
Status: ✅ Passed

Iteration history:
1: DFS 87 ❌
2: DFS 95 ❌ (high severity issue)
3: DFS 98 ✅

Improvement: +11 points
```

## Implementation Notes

- Each iteration makes a fresh API call to Figma MCP and Playwright capture
- No caching of design PNG between iterations
- User is expected to make code changes between iterations
- Loop is interactive by default (waits for user input between iterations)
- Can be made non-interactive for CI/CD pipelines

## See Also

- `/uiMatch compare` - Single comparison
- `/uiMatch settings` - Configure default thresholds
