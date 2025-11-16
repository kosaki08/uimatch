# Contributing to uiMatch

Quick reference for contributors. See the [full documentation](https://kosaki08.github.io/uimatch/) for detailed guides and API reference.

## Setup

```bash
pnpm install
pnpm test
```

## Development Workflow

```bash
# Make changes
pnpm format        # Format code
pnpm lint          # Check linting
pnpm test          # Run tests
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

## Questions?

See the [full documentation](https://kosaki08.github.io/uimatch/) or open an issue.
