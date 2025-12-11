# @uimatch/cli

## 1.0.0

### Minor Changes

- 0de4039: feat: add `areaGapCritical` and `areaGapWarning` CLI parameters and configuration options

### Patch Changes

- @uimatch/shared-logging@1.0.0
- @uimatch/selector-anchors@1.0.0

## 0.2.0

### Added

- feat(cli): add version command to display package version
- feat(core): add page/text-doc profile for text-heavy pages (Terms, Privacy Policy, documentation)
- chore(cli): standardize npx usage and update docs

### Changed

- Relaxed thresholds for text-heavy pages: 20% pixelDiff, 6.0 deltaE, 35% area gap critical

## 0.1.1

### Patch Changes

- Fix workspace protocol dependencies for npm publishing

  Replace `workspace:*` with `workspace:^` to ensure proper dependency resolution during npm publish. This fixes the issue where published packages contained unresolvable `workspace:*` dependencies, making `npx @uimatch/cli` fail with "command not found" errors.
  - @uimatch/shared-logging@0.1.1
  - @uimatch/selector-anchors@0.1.1
