# @uimatch/cli

## 0.4.0

### Minor Changes

- 2e9c891: Make browser ownership and failure reporting explicit:
  - `uiMatchCompare` now defaults to `reuseBrowser: false`, matching its documented default. A call that does not opt into the shared pool starts and closes its own browser, including on the selector-plugin path, so the programmatic API no longer keeps the Node process alive.
  - Add `closeUiMatchBrowsers()` for callers that pass `reuseBrowser: true` and need to release the process-wide pool.
  - Add `UiMatchError` with stable codes (`UIMATCH_CONFIG_INVALID_FIGMA_REF`, `UIMATCH_CONFIG_MISSING_FIGMA_TOKEN`, `UIMATCH_SELECTOR_NOT_FOUND`, `UIMATCH_IMAGE_SIZE_MISMATCH`) thrown at the point of failure and exported from `@uimatch/cli`. The CLI maps usage errors to exit code `2` and every other failure to `1`, and prints the code as `❌ Error [<code>]: <message>`. An unusable `figma` reference now exits `2` instead of `1`.
  - Validate suite items before any of them run, so a missing Figma credential or a missing required field exits `2` instead of failing every item individually.
  - Split the `fileKey:nodeId` shorthand on the first `:` only. A canonical Figma node id such as `1:2` was silently truncated to `1`, which surfaced as an unrelated Figma REST 400 instead of comparing the requested node.

- e8a3bec: Harden comparison, capture, and configuration boundaries:
  - Preserve quality-gate failures across all output formats, validate suite and profile inputs before execution, and close pooled browsers without forced process exits.
  - Omit empty style diffs, preserve root identity, and apply profile-specific high-severity limits directly in the quality gate.
  - Compare padded content consistently, composite transparent pixels over white for automatic padding, and keep DFS/CQI calculations finite at zero-area and zero-threshold boundaries.
  - Run Chromium with its sandbox enabled by default, allow an explicit environment opt-out, and select a system Chrome fallback only when the bundled executable is absent.
  - Treat selector plugins as trusted operator code while validating their runtime output and failing closed on load, execution, timeout, or contract errors.
  - Preserve root FIXED/HUG/FILL sizing provenance when bootstrapping style expectations from Figma, while treating HUG/FILL bounds as observed geometry rather than fixed CSS dimensions.

### Patch Changes

- Updated dependencies [6591665]
  - @uimatch/shared-logging@0.1.2

## 0.3.1

### Added

- feat(cli): add `--textGate` flag for text-based quality gate mode
  - When enabled with `--text=true`, the quality gate passes based on text match results instead of visual differences
  - Visual differences are still reported but don't affect CI exit code
  - Useful for text-heavy pages where content accuracy is more important than pixel-perfect visual matching

## 0.3.0

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
