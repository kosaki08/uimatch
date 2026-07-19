# AGENTS.md

Instructions for coding agents working in this repository.

## Package manager

**Use pnpm for dependency management and all repository commands.**

The project runs on Node.js. Unit and integration tests use Vitest, browser
automation uses Playwright, the liveness end-to-end suite uses Playwright Test,
and development TypeScript scripts run with tsx.

- `pnpm-lock.yaml` is the sole lockfile and must be committed whenever
  dependencies change.
- To add a dependency, run `pnpm add <pkg> --filter <workspace>` and commit the
  updated `package.json` and `pnpm-lock.yaml` together.

`pnpm run verify:package-manager` enforces this policy and runs in CI.

## Checks before committing

```bash
pnpm run check
pnpm test
```

`pnpm test` runs the unit suite, rebuilds the CLI, runs integration tests against
the new bundle, and then runs the Playwright Test suite. Use
`pnpm run test:unit` for fast local iteration; it does not execute files that
depend on `dist`.

Unit tests are type-checked as part of `pnpm run type-check`. Do not silence a
new type error in a test with `@ts-ignore`; use `@ts-expect-error` with a reason
when the test deliberately passes an invalid value, and fix the test otherwise.

## Conventions

- Conventional Commits (enforced by commitlint on commit-msg).
- English only in code, comments, and commit messages.
- No `any`; prefer `unknown` with narrowing.
