# uiMatch evals

This opt-in harness measures how different uiMatch feedback shapes affect an
LLM's ability to repair a UI regression. It is separate from the unit,
integration, Playwright, and live Figma smoke suites.

## Commands

```bash
pnpm eval:smoke
pnpm eval:run
pnpm eval:report -- --run <run-id>
```

`eval:smoke` does not call an LLM. It builds the public CLI package and verifies
the complete local harness contract: the committed mutation must fail, the
manifest repair must be applied in a temporary workspace and pass, hidden
perturbations must survive that repair, and an extra symptom patch must be
rejected by a perturbation.

`eval:run` evaluates every mutation under three conditions:

- `pixel-diff`: reference and implementation screenshots plus the pixel diff image
- `scalar`: pixel-diff feedback plus one DFS score
- `flat-diff`: scalar feedback plus flat `styleDiffs`

Trial numbers rotate the condition order to avoid always placing the same
condition last: trial 1 runs pixel-diff, scalar, flat-diff; trials 2 and 3
rotate that order. Formal comparisons should reuse one `EVAL_RUN_ID` while
running `EVAL_TRIAL=1`, `2`, and `3`; each trial has a distinct result path. The
chosen order is recorded in every result.

For each turn the runner applies the proposed declarations to a fresh copy of
the original current CSS, renders that copy, and generates new feedback. A new
proposal replaces the previous proposal; source fixtures are never edited.
Hidden acceptance runs only when the visible comparison passes or the turn
limit is reached. Its result is never sent back to the model.

## Backends and configuration

The runner supports two explicit backends. Select one backend and its matching
authentication mode; unsupported pairs fail before building, launching a
browser, or calling a model.

OpenRouter uses the non-streaming
[Chat Completions API](https://openrouter.ai/docs/api/reference/overview). It is
called with `fetch`; no provider SDK or local pricing table is maintained. The
runner requires OpenRouter's returned input, output, and total token counts plus
[cost](https://openrouter.ai/docs/cookbook/administration/usage-accounting), and
fails closed if they are missing or inconsistent:

```dotenv
EVAL_BACKEND=openrouter
EVAL_AUTH_MODE=api
OPENROUTER_API_KEY=...
EVAL_MODEL=provider/model-id
EVAL_MAX_TURNS=3
EVAL_BUDGET_USD=1.00
UIMATCH_EVAL_COMMIT=<commit supplied by the caller or build>
```

Codex runs one ephemeral `codex exec` process per harness turn using the locally
installed CLI and its existing subscription authentication. The backend pins a
read-only sandbox, ignores user configuration and repository instruction files,
passes only an allowlisted process environment needed for local authentication
and network transport, prevents model-generated shell commands from inheriting
that environment, verifies the installed CLI version and required root/exec
options without calling a model, passes images explicitly, requires the
committed repair-proposal output schema, and parses JSONL usage from the
completed turn:

```dotenv
EVAL_BACKEND=codex-exec
EVAL_AUTH_MODE=subscription
EVAL_MODEL=<codex-model-id>
EVAL_MAX_TURNS=3
UIMATCH_EVAL_COMMIT=<commit supplied by the caller or build>
```

The Codex backend deliberately does not treat a subscription turn as a zero-cost
API request. Results record subscription billing separately and do not require
or record a USD harness budget. Codex API-key billing is not supported by this backend yet,
because the CLI JSONL contract does not provide a request-level USD cost for the
harness to validate. `EVAL_AUTH_MODE=subscription` is an operator assertion;
formal runs should use a dedicated authenticated CLI environment.

The Codex process starts in an immutable agent-input snapshot containing only
the original current HTML/CSS. That snapshot uses a separate temporary root
from the mutable render workspace and hidden perturbations, and it is not
changed between turns. The model receives later proposals and visible feedback
through the explicit flattened conversation instead of reading an applied
proposal from disk. Reference source, manifests, and hidden outcomes are
omitted. The agent starts in the snapshot's nested `input/` directory, so a
routine parent-directory listing remains inside the agent-only root.

This separation prevents accidental adjacency leaks but is not an
operating-system confidentiality boundary. The Codex read-only sandbox controls
writes and model-generated command execution; a deliberately broad filesystem
search may still read paths outside the workspace. Run formal or private
evaluations inside an isolated container that mounts only the agent input if the
wider host filesystem must be unreadable.

Codex results describe the named Codex CLI version, requested model, and pinned
execution settings as an agent configuration. The runner flattens the harness
message history into each new CLI prompt, so those results are not presented as
equivalent to a raw API model using native chat roles.

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

For OpenRouter, the USD budget applies to one command, which executes one trial,
and is divided equally across all fixture/condition jobs. Calls are sequential.
OpenRouter reports a completed request's exact cost, so a job records
`"status": "aborted_budget"` when a response crosses its share or the remaining
command budget. A report that combines trials shows both the per-trial command
budget and the aggregate configured budget represented by those trials. Use a
dedicated OpenRouter key with a matching provider-side credit limit when a
strict no-overshoot ceiling is required.

Each OpenRouter turn requests at most 800 output tokens. Non-normal finish
reasons and invalid JSON proposals are recorded as protocol errors. Model or
backend failures are recorded separately from valid proposals that fail repair
acceptance.
HTTP 429, 502, 503, 504, and 529 responses are retried at most twice. A valid
`Retry-After` value is honored up to two minutes; otherwise the runner uses a
short exponential delay. Network failures are not retried because delivery may
have succeeded before the response was lost, and replaying the POST could cause
a second generation and charge. Attempts and actual delays are retained in the
turn record, while non-transient HTTP errors are not retried.

If an OpenRouter HTTP success response contains valid billing usage but fails later output
validation, the turn records that partial usage and known cost. Routing metadata
is diagnostic: invalid metadata is recorded without discarding a valid model
response. If billing usage cannot be validated, the result records
`"costUnknown": true`, uses `knownCostUsd` only as a lower bound, and stops the
command before another paid request. Reports exclude such results from cost
averages and count them separately.

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
comparisons. Visible feedback uses the normal intersection content basis.
Hidden perturbations use the union basis and must also match manifest-pinned
element width, height, padding, child count, scroll size, and overflow state.
`acceptedRepairs` is only an auxiliary root-cause classification; equivalent
CSS can pass even when it does not exactly match a listed repair.

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

`eval:report` refuses to mix multiple run IDs. `--run` may be omitted only when
the results directory contains exactly one run, and a selected run must contain
one backend, backend version, authentication mode, requested model, uiMatch
commit, budget policy, and turn limit. Trials within that boundary are
aggregated.

## Result contract

Results are stored under:

```text
evals/results/<run-id>/<fixture>/<mutation>/<condition>/<trial>.json
```

Every raw result includes:

- result `schemaVersion`
- backend ID/version, authentication mode, requested `model`, and available
  per-turn actual model/provider routing data
- `promptHash`
- `uimatchCommit`
- `runId` and `trial`
- a metered USD command/job budget or an explicit subscription billing mode,
  plus the turn limit
- `fixtureId`, `mutationId`, `condition`, and the trial's condition order
- `turns`, observed input/cached-input/output/reasoning/total tokens, and a
  discriminated billing record; subscription usage is never represented as an
  unknown or zero USD cost
- `status` and `protocolErrors`
- initial/final visible metrics and per-turn DFS, pixel ratios, quality-gate
  result, high-severity count, and StyleDiff count
- per-turn proposal, response finish reason, request attempts, retry delays,
  usage, and protocol or execution error

Final results also record visible comparison acceptance, perturbation survival,
root-cause classification, and the number of changes unmatched by the manifest's
accepted-repair hints. API keys are used only in the authorization header and
are never written to results or logs.
