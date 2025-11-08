# Testing Guidelines

This document describes the testing strategy and conventions for uiMatch.

## Testing Strategy

- **Unit Tests**: Test core logic in isolation with mocked dependencies
- **Integration Tests**: Test adapter implementations with real services
- **Fixture-based Tests**: Use generated fixtures for consistent test data
- **Visual Regression**: Maintain baseline images for comparison validation

## Test Writing Guidelines

- Write tests for all business logic
- Use descriptive test names in English
- Aim for high coverage on critical paths
- Test file naming: `*.test.ts` or `*.spec.ts`
- Mock external dependencies using adapters
- Use fixtures for consistent test data

## Test Performance

- **No network calls in unit tests**: Mock adapters; unit tests must be deterministic and offline
- Phase 0 tests must run < 200ms per spec on average; avoid I/O when possible

## Running Tests

```bash
# Run all tests (includes pretest fixture generation)
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific test file
bun test path/to/test.test.ts  # Bun test runner
```
