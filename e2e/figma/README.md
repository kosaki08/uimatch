# Live Figma smoke suite

This opt-in suite validates the real Figma REST, screenshot, expected-spec,
style-diff, selector-plugin, artifact, and CLI exit-code paths. It is separate
from normal CI because it requires a live Figma file and a secret access token.

The configured Atomic and Composite nodes are test fixtures. Keep them on a
dedicated page, mark the page as frozen, and do not edit the nodes in place.
When an intentional design change is required, update
`fixtures/design-contract.json` in the same review as the fixture change.
Use only Figma nodes that you own or are authorized to use; this repository does
not redistribute or grant rights to the configured source file.

Set these values in an ignored `.env` file:

```dotenv
FIGMA_ACCESS_TOKEN=...
UIMATCH_FIGMA_SMOKE_FILE_KEY=...
UIMATCH_FIGMA_SMOKE_ATOMIC_NODE_ID=1:2
UIMATCH_FIGMA_SMOKE_COMPOSITE_NODE_ID=3:4
```

The Figma references are intentionally not stored in this public repository.
Missing or malformed values fail with exit code 2; the suite never silently
skips.

Run it with:

```bash
pnpm run test:figma-smoke
```

The implementation fixtures are static files. The defect case has a fixed
48px gap, while the clean case has the expected 32px gap. Inter is served from
the pinned `@fontsource-variable/inter` dependency so host fonts do not affect
the comparison.

The repository fixtures use neutral, original test copy and contain no Figma
screenshots or exported Community assets. The metadata contract records only
layout and typography facts needed by the smoke test, not the source node text.
