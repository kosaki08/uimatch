# Code Style Guide

This document defines the coding standards and conventions for the uiMatch project.

## Language Policy

- **Code**: English only (variables, functions, classes, types, etc.)
- **Comments**: English only
- **Commit messages**: English only (following Conventional Commits)
- **Documentation**: English preferred
- **User-facing strings**: English (i18n support to be added later if needed)

## TypeScript

- **Strict type safety**: `any` type is forbidden (`@typescript-eslint/no-explicit-any` is set to `error`)
- Use explicit types for function parameters and return values
- Prefer `interface` over `type` for object shapes (unless union/intersection is needed)
- Use `const` assertions where appropriate
- **DO NOT disable TypeScript/ESLint rules to work around type errors**
  - Fix the root cause instead of suppressing warnings
  - If third-party type definitions are incorrect, create proper type declarations
  - Avoid `eslint-disable` comments, `@ts-ignore`, or `as any` type assertions
  - If you must use type assertions, use specific types (e.g., `as PNG`) and document why

## Naming Conventions

- **PascalCase** for types, interfaces, and classes
- **camelCase** for variables, functions, and methods
- **UPPER_SNAKE_CASE** for constants
- Prefer `interface` for object shapes; use `type` for unions/intersections and function signatures
- Keep repository naming consistent: `uimatch-*` (avoid mixed `ui-match` vs `uimatch`)

## Formatting

- **Formatter**: Prettier with the following configuration:
  - Single quotes
  - Semicolons required
  - Tab width: 2 spaces
  - Print width: 100 characters
  - Trailing commas: ES5
- **Import organization**: Automatic via `prettier-plugin-organize-imports`
  - Imports are automatically sorted and organized on save
- **Linter**: ESLint with TypeScript support (flat config)

## File Organization

- One component/class per file (with few exceptions)
- Index files (`index.ts`) for re-exporting public APIs
- Keep related files together in feature directories
