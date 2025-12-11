# @uimatch/core

## 0.3.0

### Minor Changes

- 0de4039: feat: add `areaGapCritical` and `areaGapWarning` CLI parameters and configuration options

### Patch Changes

- @uimatch/shared-logging@1.0.0

## 0.2.0

### Minor Changes

- **Quality Gate Improvements**: Allow area gap to pass when other metrics are OK
  - Area gap violations are now downgraded to warnings when pixelDiff, colorDeltaE, and styleCoverage are within thresholds
  - Treat suspicion and re_evaluation as informational only (do not fail the gate)
  - Add suspicion warnings to reasons array for better visibility in CLI output
  - Introduce `gatingViolations` to separate informational violations from gate-failing ones

## 0.1.0

- Initial release
