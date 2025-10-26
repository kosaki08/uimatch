# ui-match

Design-to-implementation comparison tool that evaluates how closely an implemented UI matches a Figma design.

## Project Structure

This is a monorepo managed with Bun workspaces:

```
ui-match/
├── packages/
│   └── uimatch-core/       # Core library for image comparison
├── docs/
│   └── specs/              # Project specifications
└── ...
```

## Packages

### uimatch-core

Core TypeScript library providing minimal image comparison functionality.

**Features (v0.1):**

- Compare two PNG images (base64 encoded)
- Calculate pixel difference ratio using pixelmatch
- Generate visual diff image
- Fully typed TypeScript API

**Usage:**

```typescript
import { compare } from 'uimatch-core';

const result = await compare({
  figmaPngB64: '...', // base64-encoded PNG from Figma
  implPngB64: '...', // base64-encoded PNG from implementation
  threshold: 0.1, // optional, default 0.1
});

console.log(result.pixelDiffRatio); // 0-1, where 0 = identical
console.log(result.diffPngB64); // base64-encoded diff image
```

## Development

### Install dependencies

```bash
bun install
```

### Run tests

```bash
# Run all tests
bun test

# Run tests in specific package
cd packages/uimatch-core && bun test
```

### Linting and formatting

```bash
# Check code style
bun run lint
bun run format:check

# Auto-fix issues
bun run lint:fix
bun run format
```

## Documentation

- [v0.1 Specification](docs/specs/v0.1.md) - Full specification for MVP implementation
- [AGENTS.md](AGENTS.md) - Project rules and conventions for AI assistants
- [CLAUDE.md](CLAUDE.md) - Claude Code specific instructions

## Requirements

- Bun (recommended) or Node.js >=22.11.0
