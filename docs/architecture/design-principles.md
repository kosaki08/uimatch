# Design & Architecture Principles

This document describes the core design philosophy and architectural patterns for uiMatch.

## Core Philosophy

- **Correctness over Performance**: Prioritize accurate visual comparison results
- **Type Safety**: Leverage TypeScript's type system for compile-time safety
- **Explicit over Implicit**: Make behavior and dependencies clear
- **Modularity**: Keep components focused and independently testable

## Architecture Patterns

### Separation of Concerns

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

### Error Handling

- **Result Types**: Use discriminated unions for operations that can fail
  ```typescript
  type Result<T, E> = { success: true; value: T } | { success: false; error: E };
  ```
- **Explicit Errors**: Define specific error types for different failure modes
- **No Silent Failures**: Always propagate or handle errors explicitly
- **Validation**: Validate inputs at boundaries (API, file I/O, user input)

## Implementation Guidelines

### Dependency Management

- Keep external dependencies minimal and well-justified
- Prefer standard library solutions when possible
- Abstract third-party libraries behind interfaces
- Document why each dependency is necessary

### Package Internal Structure

Within each package (e.g., `uimatch-core/src/`):

```
src/
├── adapters/      # External service integrations
├── core/          # Business logic and algorithms
├── types/         # Shared type definitions
├── config/        # Configuration schemas and loaders
└── utils/         # Shared utilities
```

### Performance Considerations

- Optimize only after measuring (profile first)
- Document performance-critical sections
- Consider caching strategies for expensive operations
- Use streaming for large data sets when applicable

### Observability

- Emit structured logs with `traceId` per comparison invocation
- Log levels: `debug` (dev only), `info` (milestones: fetched/captured/diffed/scored), `warn` (non-fatal), `error` (with error code)
- No PII in logs. Mask URLs and query params that may contain tokens

### Domain-Specific Guidelines

#### Threshold Terminology

- `pixelmatchThreshold` = pixelmatch's internal comparator threshold (0..1), default 0.1
- `acceptanceThreshold` = acceptance criteria for `pixelDiffRatio` and `colorDeltaEAvg` in our quality gate
- Never conflate the two in code or docs

#### Patch Hint Rules

- Implement patch hints as rule objects with a stable interface:
  `evaluate(styleDiff, context) -> PatchHint[]`
- Rules must be side-effect-free and order-independent
- New rules must include unit tests and severity mapping notes
