# Development Setup

This document describes the required tools and setup for developing uiMatch.

## Required Tools

- **Runtime**: Bun 1.x
- **Package manager**: Bun (`packageManager` field enforced)
- **Editor**: VS Code (recommended)

## VS Code Extensions

Recommended extensions are configured in `.vscode/extensions.json`:

- Prettier (esbenp.prettier-vscode)
- ESLint (dbaeumer.vscode-eslint)
- Bun (oven.bun-vscode)

## Available Scripts

- `bun install`: Install dependencies and Playwright browsers (via postinstall hook)
- `bun run lint`: Check code with ESLint
- `bun run lint:fix`: Auto-fix ESLint issues
- `bun run format`: Format all files with Prettier
- `bun run format:check`: Check formatting without writing
- `bun run test`: Run all tests (includes pretest fixture generation)

## Environment Variables

Required for plugin operation:

- `FIGMA_MCP_URL`: Figma MCP server URL (e.g., `http://localhost:8765`)
- `FIGMA_MCP_TOKEN`: (Optional) Bearer token for Figma MCP authentication
- `BASIC_AUTH_USER`: (Optional) Basic auth username for target URLs
- `BASIC_AUTH_PASS`: (Optional) Basic auth password for target URLs

## CI & Reproducibility

- Phase 0 tests: < 200ms per spec; avoid I/O when possible
- Playwright browsers: install with `--with-deps` and cache
- **Package manager**: Bun only (lock: `bun.lock`; others gitignored)
- **CI**: Bun for all operations except `npm publish` in release workflow

## Versioning & Release

- Use SemVer per package (`uimatch-core`, `uimatch-plugin`)
- Plugin version in `.claude-plugin/plugin.json` and `marketplace.json` must match package version
- Keep a `CHANGELOG.md`. Prefer Changesets or conventional-changelog for automation
- Public API changes require entry in CHANGELOG and docs update
