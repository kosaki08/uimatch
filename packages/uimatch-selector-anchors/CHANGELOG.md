# @uimatch/selector-anchors

## 0.2.0

### Minor Changes

- bb4b890: Confine anchor resolution to the project root and tighten its inputs:
  - Export the project-path helpers used to canonicalize and confine file access, including symlink escape rejection.
  - Improve selector resolution, regex loading, and source-position handling, and make anchor write-back validated and atomic.
  - Require `@uimatch/selector-spi` to match the released contract instead of accepting any newer version.

## 0.1.1

### Patch Changes

- @uimatch/selector-spi@0.1.1
