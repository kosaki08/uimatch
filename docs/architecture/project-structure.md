# Project Structure

This document describes the structure of the uiMatch monorepo.

## Overview

This is a monorepo using Bun workspaces:

```
ui-match/
├── .claude-plugin/        # Claude Code plugin definition
│   ├── plugin.json        # Plugin metadata
│   ├── commands/          # Command implementations (compare, loop, settings)
│   └── mcp.json           # Figma MCP integration
├── packages/              # Workspace packages
│   ├── uimatch-core/      # Core comparison library
│   │   ├── src/           # Source code
│   │   ├── fixtures/      # Test fixtures
│   │   └── scripts/       # Utility scripts
│   └── uimatch-plugin/    # Plugin integration code
│       └── src/           # Command handlers and adapters
├── docs/                  # Documentation
│   ├── contributing/      # Contribution guidelines
│   ├── architecture/      # Architecture documentation
│   ├── concepts/          # Core concepts and features
│   └── examples/          # Usage examples
└── README.md              # Project overview
```

## Package Organization

### uimatch-core

The core comparison library containing:

- Visual comparison algorithms
- Style difference detection
- Figma and Playwright adapters
- Configuration schemas

### uimatch-plugin

Claude Code plugin integration:

- Command handlers
- MCP server integration
- Plugin-specific adapters

## Documentation Structure

### docs/contributing/

Developer contribution guidelines:

- `code-style.md`: Coding standards and conventions
- `git-workflow.md`: Git workflow and commit messages
- `development-setup.md`: Development tools and environment setup
- `testing.md`: Testing strategy and guidelines

### docs/architecture/

Architecture and design documentation:

- `design-principles.md`: Core design philosophy and patterns
- `project-structure.md`: This document
- `security.md`: Security guidelines and best practices

### docs/concepts/

Core concepts and feature documentation:

- `quality-gate-v2.md`: Content-aware quality metrics
- `selector-resolution.md`: Selector resolution strategies
- `size-handling.md`: Size mismatch handling strategies

### docs/examples/

Usage examples and patterns:

- `page-vs-component.md`: Comparing different contexts
- `component-vs-component.md`: Strict component comparison
- `anchors-stabilization.md`: Selector anchor stabilization
