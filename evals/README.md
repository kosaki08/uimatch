# uiMatch evals

This opt-in harness measures how different uiMatch feedback shapes affect an
LLM's ability to repair a UI regression. It is separate from the unit,
integration, Playwright, and live Figma smoke suites.

## Commands

```bash
pnpm eval:smoke
pnpm eval:run
pnpm eval:report
```

`eval:smoke` does not call an LLM. It builds the public CLI package and verifies
the complete local harness contract: the committed mutation must fail, the
manifest repair must be applied in a temporary workspace and pass, hidden
perturbations must survive that repair, and an extra symptom patch must be
rejected by a perturbation.

`eval:run` evaluates every mutation under three conditions:

- `render-only`: reference, implementation, and diff images
- `scalar`: render-only feedback plus one DFS score
- `flat-diff`: scalar feedback plus flat `styleDiffs`

For each turn the runner applies the proposed declarations to a fresh copy of
the original current CSS, renders that copy, and generates new feedback. A new
proposal replaces the previous proposal; source fixtures are never edited.
Hidden acceptance runs only when the visible comparison passes or the turn
limit is reached. Its result is never sent back to the model.

## Configuration

The initial model transport is OpenRouter's non-streaming
[Chat Completions API](https://openrouter.ai/docs/api/reference/overview). It is
called with `fetch`; no provider SDK or local pricing table is maintained. The
runner requires OpenRouter's returned prompt, completion, and total token counts
plus [cost](https://openrouter.ai/docs/cookbook/administration/usage-accounting),
and fails closed if they are missing or inconsistent.

Set the following variables in an ignored `.env` file:

```dotenv
OPENROUTER_API_KEY=...
EVAL_MODEL=provider/model-id
EVAL_MAX_TURNS=3
EVAL_BUDGET_USD=1.00
UIMATCH_EVAL_COMMIT=<commit supplied by the caller or build>
```

Optional result identity variables:

```dotenv
EVAL_RUN_ID=experiment-001
EVAL_TRIAL=1
```

When `EVAL_RUN_ID` is omitted, the runner generates a UUID. Reusing the same run
ID, fixture, mutation, condition, and trial is rejected instead of overwriting
an existing result.

Missing or invalid required configuration exits with code 2 before building,
launching a browser, or calling the model. The runner never derives
`UIMATCH_EVAL_COMMIT` with Git, because packaged or restricted environments may
not contain repository metadata.

The USD budget applies to the whole command. Calls are sequential. OpenRouter
reports a completed request's exact cost, so the runner stops immediately and
records `"status": "aborted_budget"` when that response crosses the remaining
budget. Use a dedicated OpenRouter key with a matching provider-side credit
limit when a strict no-overshoot ceiling is required.

Each turn requests at most 800 output tokens. Non-normal finish reasons and
invalid JSON proposals are recorded as protocol errors. Model/API failures are
recorded separately from valid proposals that fail repair acceptance.

Requests do not send app-attribution headers. Routing metadata is requested so
results can record the generation ID, actual model, selected provider, fallback
use, and per-turn token counts. Provider routing denies endpoints that may store
request data. Provider fallback remains enabled; formal comparisons should
either inspect the recorded routing data or add an explicit provider policy for
that experiment.

## Repair and acceptance boundary

The initial scaffold intentionally supports only CSS declaration proposals. The
patcher:

- limits selectors to `editableSelectors` in the manifest
- rejects unsafe values such as `url(...)`, additional blocks, or declarations
- appends overrides only inside a temporary directory
- applies the same complete proposal to the current fixture and every hidden
  perturbation

Acceptance is based on the final uiMatch comparison and actual perturbation
comparisons. `acceptedRepairs` is only an auxiliary root-cause classification;
equivalent CSS can pass even when it does not exactly match a listed repair.

The model sees only the current implementation HTML/CSS and feedback allowed by
the condition. Reference source, manifest root-cause labels, mutation IDs, and
hidden evaluator outcomes are not included in prompts. The fixture source must
therefore keep answer-bearing names and reference declarations out of the
current implementation presented to the model.

## Fixtures and data policy

Each mutation and perturbation is a committed static HTML/CSS variant. The
fixture pattern follows `e2e/figma/`: neutral repository-owned copy, the pinned
Inter font served from `@fontsource-variable/inter`, and no Figma exports,
screenshots, source file keys, node IDs, URLs, timestamps, or base64 artifacts in
Git.

Reference and current HTML/CSS plus manifests are committed. Raw results are
written to ignored `evals/results/`; only reviewed aggregates may be promoted to
`evals/summaries/`.

## Result contract

Results are stored under:

```text
evals/results/<run-id>/<fixture>/<mutation>/<condition>/<trial>.json
```

Every raw result includes:

- requested `model` and per-turn actual model/provider routing data
- `promptHash`
- `uimatchCommit`
- `runId` and `trial`
- `fixtureId`, `mutationId`, and `condition`
- `turns`, input/output/total tokens, and cost
- `status` and `protocolErrors`

Final results also record visible comparison acceptance, perturbation survival,
root-cause classification, and symptom patch count. API keys are used only in
the authorization header and are never written to results or logs.
