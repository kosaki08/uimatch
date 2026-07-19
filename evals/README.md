# uiMatch evals

This opt-in harness measures how different uiMatch feedback shapes affect an
LLM's ability to identify a UI regression's root cause. It is separate from the
unit, integration, Playwright, and live Figma smoke suites.

## Commands

```bash
pnpm eval:smoke
pnpm eval:run
pnpm eval:report
```

`eval:smoke` does not call an LLM. It builds the public CLI package, serves the
reference fixture, renders it with Playwright, calls `uiMatchCompare()` once
through the `@uimatch/cli` public export, and verifies the manifest contract.

`eval:run` evaluates every mutation under three conditions:

- `render-only`: reference, implementation, and diff images
- `scalar`: render-only feedback plus one DFS score
- `flat-diff`: scalar feedback plus flat `styleDiffs`

The initial model transport is OpenRouter's non-streaming
[Chat Completions API](https://openrouter.ai/docs/api/reference/overview). It is
called with `fetch`; no provider SDK or local pricing table is maintained. The
runner requires OpenRouter's returned token count and
[cost](https://openrouter.ai/docs/cookbook/administration/usage-accounting), and
fails closed if either is missing or invalid.

Each turn requests at most 800 output tokens. A response that stops for any
reason other than normal completion is recorded as an error instead of being
treated as a complete repair proposal.

Set the following variables in an ignored `.env` file:

```dotenv
OPENROUTER_API_KEY=...
EVAL_MODEL=provider/model-id
EVAL_MAX_TURNS=3
EVAL_BUDGET_USD=1.00
UIMATCH_EVAL_COMMIT=<commit supplied by the caller or build>
```

Missing or invalid configuration exits with code 2 before building, launching a
browser, or calling the model. The runner never derives `UIMATCH_EVAL_COMMIT`
with Git, because packaged or restricted environments may not contain repository
metadata.

The USD budget applies to the whole command. Calls are sequential. OpenRouter
reports a completed request's exact cost, so the runner stops immediately and
records `"status": "aborted_budget"` when that response crosses the remaining
budget. Use a dedicated OpenRouter key with a matching provider-side credit
limit when a strict no-overshoot ceiling is required.

## Fixtures and manifests

Each mutation and perturbation is a committed static HTML/CSS variant. The
runner never edits a source fixture in place. The manifest records expected
metadata, mutations, hidden perturbations, and accepted root-cause repairs.

The fixture pattern follows `e2e/figma/`: neutral repository-owned copy, the
pinned Inter font served from `@fontsource-variable/inter`, and no Figma exports,
screenshots, source file keys, node IDs, URLs, timestamps, or base64 artifacts in
Git. Reference and mutation HTML/CSS plus manifests are committed. Raw results
are written to ignored `evals/results/`; only reviewed aggregates may be promoted
to `evals/summaries/`.

## Result contract

Every raw result includes:

- `model`
- `promptHash`
- `uimatchCommit`
- `fixtureId`
- `mutationId`
- `condition`
- `turns`
- `tokensUsed`
- `status`

Results also record the cost and hidden-acceptance details when available. API
keys are used only in the authorization header and are never written to results
or logs.
