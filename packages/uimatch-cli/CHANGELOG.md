# @uimatch/cli

## 0.1.1

### Patch Changes

- Fix workspace protocol dependencies for npm publishing

  Replace `workspace:*` with `workspace:^` to ensure proper dependency resolution during npm publish. This fixes the issue where published packages contained unresolvable `workspace:*` dependencies, making `npx @uimatch/cli` fail with "command not found" errors.
  - @uimatch/shared-logging@0.1.1
  - @uimatch/selector-anchors@0.1.1
