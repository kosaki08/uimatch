# @uimatch/core

Internal comparison engine for uiMatch. This workspace package is private and
is bundled into `@uimatch/cli`; it is not a supported npm entry point.

## Responsibilities

- Capture implementation screenshots and computed styles with Playwright.
- Compare PNG images with configurable size and content-area handling.
- Build property-level StyleDiff records from captured and expected styles.
- Evaluate quality-gate primitives used by the CLI.
- Provide shared normalization, color, and text-comparison utilities.

User-facing argument parsing, project configuration, reporting, and process exit
codes belong to `@uimatch/cli`.

## Configuration boundaries

The comparison configuration deliberately keeps these color thresholds separate:

| Setting                            | Stage                                        |
| ---------------------------------- | -------------------------------------------- |
| `comparison.colorDeltaEThreshold`  | StyleDiff significance and SFS normalization |
| `comparison.acceptanceColorDeltaE` | Aggregate color quality gate                 |

The values have the same default but represent different domain decisions. A
CLI profile or programmatic per-run threshold may override both for compatibility.

`DEFAULT_CONFIG` and the Zod schemas are the source of truth for default values
and validation. `.uimatchrc.json` loading is owned by the CLI.

## Source map

- `src/adapters/` — browser launch, pooling, capture, and selector resolution
- `src/core/compare.ts` — image comparison and size handling
- `src/core/diff/` — StyleDiff construction and severity classification
- `src/core/quality-gate.ts` — CQI and gate evaluation
- `src/config/` — defaults, schemas, profiles, and validated config merging
- `src/utils/` — color, normalization, and text utilities

Use the exported TypeScript types and implementation as the internal API
reference. Do not duplicate function signatures in this README; they drift from
the compiler-checked source.

## Development

From the repository root:

```shell
pnpm install
pnpm run build
pnpm run test:unit
pnpm run check
```

For end-user installation and usage, see the
[`@uimatch/cli` README](../uimatch-cli/README.md).
