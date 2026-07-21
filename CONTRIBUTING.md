# Contributing to uiMatch

Quick reference for contributors. See the [full documentation](https://kosaki08.github.io/uimatch/) for detailed guides and API reference.

## Setup

```bash
pnpm install
pnpm test
```

Use pnpm for dependency management and repository commands. The project runs on
Node.js; unit and integration tests use Vitest, browser automation uses
Playwright, and the liveness E2E suite uses Playwright Test.

## Development Workflow

```bash
# Make changes
pnpm format               # Format code
pnpm lint                 # Check linting
pnpm run test:unit        # Fast unit tests without a build
pnpm test                 # Unit + integration + Playwright Test suites
```

## Commit Guidelines

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add style fidelity scoring
fix: resolve screenshot timing issue
refactor: improve color delta calculation
docs: update API documentation
test: add content basis test cases
```

## Code Standards

- **No `any` type**: Use `unknown` or proper types
- **English only**: Code, comments, commits
- **Read before write**: Always read files before editing
- **Test coverage**: Add tests for new features
- **No network in unit tests**: Mock adapters

## Releasing

Public packages version independently. Add a changeset for each package whose
published surface changed. `@uimatch/core` and `@uimatch/scoring` are private,
so they never belong in one.

Pushing to `main` runs the release job, the last one in the ci workflow, once
every suite before it has passed. It opens a `chore: version packages` pull
request; merging that pull request publishes to npm, and only when the
`ENABLE_PUBLISH` repository variable is `true`.

Bump versions with `pnpm run version:packages` rather than `changeset version`
directly. Every public package is on `0.x`, where a caret range pins the minor,
so a minor bump of a package that another one peer-depends on would otherwise
make Changesets bump the dependent to major. The script relaxes those ranges for
the duration of the bump and pins them to the versions it produced. It needs a
clean working tree, and it stops if a package ends up with a changed manifest but
the same version — add a changeset for that package and run it again.

`pnpm run release:verify` packs the tarballs and installs them with `npm`. Run it
before publishing: `pnpm` only warns when a peer cannot be satisfied, while `npm`
quietly leaves the package out.

## Key Documentation

- [Full Documentation](https://kosaki08.github.io/uimatch/) - Complete guides and API reference
- [Getting Started](https://kosaki08.github.io/uimatch/docs/getting-started) - Quick start guide
- [Concepts](https://kosaki08.github.io/uimatch/docs/concepts) - Core concepts and architecture
- [CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference) - Command-line interface guide

## Documentation ownership

- The root README is the project entry point and contains only the overview,
  minimal quick start, architecture, and links.
- Public package READMEs contain package-specific installation, one working
  example, runtime requirements, and links.
- `docs/docs/` is the source of truth for detailed guides, CLI options,
  configuration, and troubleshooting.
- TypeDoc generated from exported source is the source of truth for public
  TypeScript signatures. Do not copy signatures or default-value tables into
  READMEs.

Run `pnpm run docs:build` after changing documentation, exported TypeScript
interfaces, or Docusaurus configuration.

## Questions?

See the [full documentation](https://kosaki08.github.io/uimatch/) or open an issue.
