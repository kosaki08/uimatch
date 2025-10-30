# Contributing to uiMatch

Quick reference for contributors. See [AGENTS.md](./AGENTS.md) for detailed project rules.

## Setup

```bash
bun install
bun test
```

## Development Workflow

```bash
# Make changes
bun run format        # Format code
bun run lint          # Check linting
bun test             # Run tests
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

Always include the footer:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Code Standards

- **No `any` type**: Use `unknown` or proper types
- **English only**: Code, comments, commits
- **Read before write**: Always read files before editing
- **Test coverage**: Add tests for new features
- **No network in unit tests**: Mock adapters

## Key Files

- `AGENTS.md` - AI assistant rules
- `CLAUDE.md` - Claude Code specific instructions
- `docs/specs/v0.1.md` - MVP specification

## Questions?

See [AGENTS.md](./AGENTS.md) for detailed guidelines or open an issue.
