# Agent Guidelines for uiMatch

This document contains project-specific rules and conventions that all AI coding assistants should follow when working on this project.

## Language Policy

- **Code**: English only (variables, functions, classes, types, etc.)
- **Comments**: English only
- **Commit messages**: English only (following Conventional Commits)
- **Documentation**: English preferred
- **User-facing strings**: English (i18n support to be added later if needed)

## Code Style

### TypeScript

- **Strict type safety**: `any` type is forbidden (`@typescript-eslint/no-explicit-any` is set to `error`)
- Use explicit types for function parameters and return values
- Prefer `interface` over `type` for object shapes (unless union/intersection is needed)
- Use `const` assertions where appropriate
- **DO NOT disable TypeScript/ESLint rules to work around type errors**
  - Fix the root cause instead of suppressing warnings
  - If third-party type definitions are incorrect, create proper type declarations
  - Avoid `eslint-disable` comments, `@ts-ignore`, or `as any` type assertions
  - If you must use type assertions, use specific types (e.g., `as PNG`) and document why

### Naming Conventions

- **PascalCase** for types, interfaces, and classes
- **camelCase** for variables, functions, and methods
- **UPPER_SNAKE_CASE** for constants
- Prefer `interface` for object shapes; use `type` for unions/intersections and function signatures
- Keep repository naming consistent: `uimatch-*` (avoid mixed `ui-match` vs `uimatch`)

### Formatting

- **Formatter**: Prettier with the following configuration:
  - Single quotes
  - Semicolons required
  - Tab width: 2 spaces
  - Print width: 100 characters
  - Trailing commas: ES5
- **Import organization**: Automatic via `prettier-plugin-organize-imports`
  - Imports are automatically sorted and organized on save
- **Linter**: ESLint with TypeScript support (flat config)

### File Organization

- One component/class per file (with few exceptions)
- Index files (`index.ts`) for re-exporting public APIs
- Keep related files together in feature directories

## Git Workflow

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>: <subject>

<body>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring (no functional changes)
- `style`: Code style changes (formatting, etc.)
- `test`: Adding or updating tests
- `docs`: Documentation changes
- `chore`: Build process or tooling changes
- `perf`: Performance improvements
- `ci`: CI/CD configuration changes

**Examples:**

```
feat: add Figma API integration for design fetch

Implement FigmaClient class to fetch design frames and
variables via Figma REST API with rate limiting support.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

```
fix: resolve screenshot timing issue in Playwright

Wait for fonts to load before capturing screenshots
to prevent rendering inconsistencies.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Branch Naming

- Feature branches: `feature/<description>`
- Bug fix branches: `fix/<description>`
- Use kebab-case for branch names

## Design & Architecture Principles

### Core Philosophy

- **Correctness over Performance**: Prioritize accurate visual comparison results
- **Type Safety**: Leverage TypeScript's type system for compile-time safety
- **Explicit over Implicit**: Make behavior and dependencies clear
- **Modularity**: Keep components focused and independently testable

### Architecture Patterns

#### Separation of Concerns

- **Adapters**: Isolate external dependencies (Figma API, Playwright, file system)
  - Create interfaces for each external service
  - Implement concrete adapters that can be swapped
  - Example: `FigmaAdapter`, `PlaywrightAdapter`, `FileSystemAdapter`
- **Core Logic**: Pure business logic with minimal dependencies
  - Keep comparison algorithms separate from I/O operations
  - Use dependency injection for testability
- **Configuration**: Centralize settings and make them explicit
  - Define configuration schemas with validation
  - Support multiple configuration sources (files, environment, programmatic)

#### Error Handling

- **Result Types**: Use discriminated unions for operations that can fail
  ```typescript
  type Result<T, E> = { success: true; value: T } | { success: false; error: E };
  ```
- **Explicit Errors**: Define specific error types for different failure modes
- **No Silent Failures**: Always propagate or handle errors explicitly
- **Validation**: Validate inputs at boundaries (API, file I/O, user input)

#### Testing Strategy

- **Unit Tests**: Test core logic in isolation with mocked dependencies
- **Integration Tests**: Test adapter implementations with real services
- **Fixture-based Tests**: Use generated fixtures for consistent test data
- **Visual Regression**: Maintain baseline images for comparison validation

### Implementation Guidelines

#### Dependency Management

- Keep external dependencies minimal and well-justified
- Prefer standard library solutions when possible
- Abstract third-party libraries behind interfaces
- Document why each dependency is necessary

#### Package Internal Structure

Within each package (e.g., `uimatch-core/src/`):

```
src/
├── adapters/      # External service integrations
├── core/          # Business logic and algorithms
├── types/         # Shared type definitions
├── config/        # Configuration schemas and loaders
└── utils/         # Shared utilities
```

#### Performance Considerations

- Optimize only after measuring (profile first)
- Document performance-critical sections
- Consider caching strategies for expensive operations
- Use streaming for large data sets when applicable

#### Security & Secrets

- Do **not** print or commit secrets (tokens, credentials, cookies)
- Configuration must be injected via environment variables and typed schema (e.g., zod)
- Generated artifacts (screenshots, diffs) are **in-memory by default**. Persist only when explicitly approved
- Never embed base64 images or secrets in commit messages, code, or PR descriptions
- Use `.gitignore` to exclude `/fixtures/*.png`, `/dist`, and any temp outputs

#### Observability

- Emit structured logs with `traceId` per comparison invocation
- Log levels: `debug` (dev only), `info` (milestones: fetched/captured/diffed/scored), `warn` (non-fatal), `error` (with error code)
- No PII in logs. Mask URLs and query params that may contain tokens

#### Threshold Terminology

- `pixelmatchThreshold` = pixelmatch's internal comparator threshold (0..1), default 0.1
- `acceptanceThreshold` = acceptance criteria for `pixelDiffRatio` and `colorDeltaEAvg` in our quality gate
- Never conflate the two in code or docs

#### Patch Hint Rules

- Implement patch hints as rule objects with a stable interface:
  `evaluate(styleDiff, context) -> PatchHint[]`
- Rules must be side-effect-free and order-independent
- New rules must include unit tests and severity mapping notes

## Testing

- Write tests for all business logic
- Use descriptive test names in English
- Aim for high coverage on critical paths
- Test file naming: `*.test.ts` or `*.spec.ts`
- Mock external dependencies using adapters
- Use fixtures for consistent test data
- **No network calls in unit tests**: Mock adapters; unit tests must be deterministic and offline
- Phase 0 tests must run < 200ms per spec on average; avoid I/O when possible

## Documentation

- Use JSDoc comments for public APIs
- Keep README.md up to date
- Document complex algorithms or non-obvious decisions
- Prefer self-documenting code over comments when possible

## CI & Reproducibility

- Phase 0 tests must run < 200ms per spec on average; avoid I/O when possible
- In CI, install browsers explicitly (Playwright) and pin versions for reproducibility
- Cache dependencies and Playwright browsers; generate fixtures in a pretest step

## Versioning & Release

- Use SemVer per package (`uimatch-core`, `uimatch-skill`)
- Keep a `CHANGELOG.md`. Prefer Changesets or conventional-changelog for automation
- Public API changes require entry in CHANGELOG and docs update

## Development Tools

### Required

- **Runtime**: Bun (recommended) or Node.js >=22.11.0
- **Package manager**: Bun
- **Editor**: VS Code (recommended with extensions)

### VS Code Extensions

Recommended extensions are configured in `.vscode/extensions.json`:

- Prettier (esbenp.prettier-vscode)
- ESLint (dbaeumer.vscode-eslint)
- Bun (oven.bun-vscode)

### Available Scripts

- `bun run lint`: Check code with ESLint
- `bun run lint:fix`: Auto-fix ESLint issues
- `bun run format`: Format all files with Prettier
- `bun run format:check`: Check formatting without writing

## Project Structure

This is a monorepo using Bun workspaces:

```
ui-match/
├── packages/           # Workspace packages
│   └── uimatch-core/  # Core comparison library
│       ├── src/       # Source code
│       ├── fixtures/  # Test fixtures
│       └── scripts/   # Utility scripts
├── docs/              # Documentation and specifications
├── .vscode/           # VS Code settings
├── AGENTS.md          # This file (project rules for AI assistants)
├── CLAUDE.md          # Claude-specific instructions
├── GEMINI.md          # Gemini-specific instructions
└── README.md          # Project overview
```

## Notes for AI Assistants

### General Guidelines

- Always run `bun run format` after making changes
- Run `bun run lint` before committing
- Ensure commit messages are in English and follow Conventional Commits
- Never use `any` type - use `unknown` or proper types instead
- When in doubt, ask the user for clarification rather than making assumptions

### Safety Rails for AI Assistants

- **Read before write**: Always read existing files before proposing edits
- **No destructive ops**: Do not remove files/folders or rewrite large sections without explicit instruction
- **No background processes**: Do not spawn long-running tasks or external services implicitly
- **No network calls in unit tests**: Mock adapters; unit tests must be deterministic and offline
- **Do not push to remote** or change branch protection rules without explicit approval
