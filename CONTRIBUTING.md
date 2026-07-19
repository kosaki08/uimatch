# Contributing to uiMatch

Quick reference for contributors. See the [full documentation](https://kosaki08.github.io/uimatch/) for detailed guides and API reference.

## Setup

```bash
pnpm install
pnpm test
```

Use pnpm for dependency management and repository commands. The project runs on
Node.js; unit tests use Vitest and browser E2E tests use Playwright.

## Development Workflow

```bash
# Make changes
pnpm format               # Format code
pnpm lint                 # Check linting
pnpm run test:unit        # Fast unit tests without a build
pnpm test                 # Unit + built-CLI integration tests
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
