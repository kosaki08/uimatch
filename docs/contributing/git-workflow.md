# Git Workflow

This document describes the Git workflow and commit conventions for the uiMatch project.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>: <subject>

<body>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring (no functional changes)
- `style`: Code style changes (formatting, etc.)
- `test`: Adding or updating tests
- `docs`: Documentation changes
- `chore`: Build process or tooling changes
- `perf`: Performance improvements
- `ci`: CI/CD configuration changes

### Examples

```
feat: add Figma API integration for design fetch

Implement FigmaClient class to fetch design frames and
variables via Figma REST API with rate limiting support.
```

```
fix: resolve screenshot timing issue in Playwright

Wait for fonts to load before capturing screenshots
to prevent rendering inconsistencies.
```

## Branch Naming

- Feature branches: `feature/<description>`
- Bug fix branches: `fix/<description>`
- Use kebab-case for branch names

## Commit Workflow Best Practices

1. Review changes with `git status` and `git diff --staged`
2. Ensure commit messages are in English and follow Conventional Commits
3. Run `bun run format` and `bun run lint` before committing
4. Keep commits atomic and focused on a single concern
