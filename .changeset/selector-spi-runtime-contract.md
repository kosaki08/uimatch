---
'@uimatch/selector-spi': minor
---

Publish the selector resolution result as a runtime contract:

- Export `ResolutionSchema` so hosts can validate plugin output instead of trusting it, and derive `Resolution` from that schema. `stabilityScore` is now bounded to 0-100, and `selector`/`subselector` must contain a non-whitespace character.
- Add `zod` as a runtime dependency; the package was previously types-only.
- Document `projectRoot` as the canonical file-access boundary instead of a deprecated path hint, and make plugins that support write-back responsible for validating and persisting their own data.
