# Project Structure

This document describes the structure of the uiMatch monorepo.

## Overview

This is a monorepo using Bun workspaces:

```
ui-match/
├── .claude-plugin/        # Claude Code plugin definition
│   ├── plugin.json        # Plugin metadata
│   ├── commands/          # Command implementations (compare, loop, settings)
│   ├── mcp.json           # Figma MCP integration
│   └── marketplace.json   # Distribution metadata
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
│   └── ai-assistant/      # AI assistant guidelines
├── AGENTS.md              # AI assistant guidelines (references docs/)
├── CLAUDE.md              # Claude Code specific instructions (references docs/)
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

### docs/ai-assistant/

AI assistant specific instructions:

- `claude-code.md`: Claude Code tool usage and workflows
- `general-guidelines.md`: General AI assistant guidelines
