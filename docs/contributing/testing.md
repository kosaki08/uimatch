# Testing Guidelines

This document describes the testing strategy and conventions for uiMatch.

## Testing Strategy

- **Unit Tests**: Test core logic in isolation with mocked dependencies
- **Integration Tests**: Test adapter implementations with real services
- **Fixture-based Tests**: Use generated fixtures for consistent test data
- **Visual Regression**: Maintain baseline images for comparison validation

## Test Writing Guidelines

- Write tests for all business logic with descriptive names (English)
- Aim for high coverage on critical paths
- Mock external dependencies using adapters
- Use fixtures for consistent test data

### Test Organization

- **Unit/Integration**: `packages/*/src/**/*.test.ts` (always run)
- **E2E browser tests**: `e2e/**/*.e2e.test.ts` (gated by `UIMATCH_ENABLE_BROWSER_TESTS=true`)

All E2E test files must include environment gate:

```typescript
const ENABLE_E2E = process.env.UIMATCH_ENABLE_BROWSER_TESTS === 'true';
const run = ENABLE_E2E ? describe : describe.skip;
run('Suite name', () => {
  /* tests */
});
```

## Test Performance

- **No network calls in unit tests**: Mock adapters; unit tests must be deterministic and offline
- Phase 0 tests must run < 200ms per spec on average; avoid I/O when possible

## Running Tests

```bash
# Unit and integration tests
pnpm test

# With coverage
pnpm test:coverage

# E2E browser tests
UIMATCH_ENABLE_BROWSER_TESTS=true pnpm test
```

### Build Configuration

- `tsconfig.json`: IDE and test runner (includes test files)
- `tsconfig.build.json`: Production build (excludes tests and artifacts)
