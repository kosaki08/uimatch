---
'@uimatch/cli': minor
---

Make browser ownership and failure reporting explicit:

- `uiMatchCompare` now defaults to `reuseBrowser: false`, matching its documented default. A call that does not opt into the shared pool starts and closes its own browser, including on the selector-plugin path, so the programmatic API no longer keeps the Node process alive.
- Add `closeUiMatchBrowsers()` for callers that pass `reuseBrowser: true` and need to release the process-wide pool.
- Add `UiMatchError` with stable codes (`UIMATCH_CONFIG_INVALID_FIGMA_REF`, `UIMATCH_CONFIG_MISSING_FIGMA_TOKEN`, `UIMATCH_SELECTOR_NOT_FOUND`, `UIMATCH_IMAGE_SIZE_MISMATCH`) thrown at the point of failure and exported from `@uimatch/cli`. The CLI maps usage errors to exit code `2` and every other failure to `1`, and prints the code as `❌ Error [<code>]: <message>`. An unusable `figma` reference now exits `2` instead of `1`.
- Validate suite items before any of them run, so a missing Figma credential or a missing required field exits `2` instead of failing every item individually.
- Split the `fileKey:nodeId` shorthand on the first `:` only. A canonical Figma node id such as `1:2` was silently truncated to `1`, which surfaced as an unrelated Figma REST 400 instead of comparing the requested node.
