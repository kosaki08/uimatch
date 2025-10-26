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

## Testing

- Write tests for all business logic
- Use descriptive test names in English
- Aim for high coverage on critical paths
- Test file naming: `*.test.ts` or `*.spec.ts`

## Documentation

- Use JSDoc comments for public APIs
- Keep README.md up to date
- Document complex algorithms or non-obvious decisions
- Prefer self-documenting code over comments when possible

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

```
ui-match/
├── docs/           # Documentation and specifications
├── src/            # Source code (to be created)
├── tests/          # Test files (to be created)
├── .vscode/        # VS Code settings
├── AGENTS.md       # This file (project rules for AI assistants)
├── CLAUDE.md       # Claude-specific instructions
├── GEMINI.md       # Gemini-specific instructions
└── README.md       # Project overview
```

## Notes for AI Assistants

- Always run `bun run format` after making changes
- Run `bun run lint` before committing
- Ensure commit messages are in English and follow Conventional Commits
- Never use `any` type - use `unknown` or proper types instead
- When in doubt, ask the user for clarification rather than making assumptions
