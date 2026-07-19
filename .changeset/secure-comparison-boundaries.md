---
'@uimatch/cli': minor
'@uimatch/core': minor
'@uimatch/scoring': minor
'@uimatch/selector-anchors': minor
'@uimatch/selector-spi': minor
---

Harden comparison, selector, and configuration boundaries:

- Preserve quality-gate failures across all output formats, validate suite and profile inputs before execution, and close pooled browsers without forced process exits.
- Omit empty style diffs, preserve root identity, and apply profile-specific high-severity limits directly in the core quality gate.
- Compare padded content consistently, composite transparent pixels over white for automatic padding, and keep DFS/CQI calculations finite at zero-area and zero-threshold boundaries.
- Improve selector anchor resolution, regex loading, source-position handling, and project-root confinement, including symlink escape rejection and validated atomic anchor write-back.
- Run Chromium with its sandbox enabled by default, allow an explicit environment opt-out, and select a system Chrome fallback only when the bundled executable is absent.
- Treat selector plugins as trusted operator code while validating their runtime output and failing closed on load, execution, timeout, or contract errors.
