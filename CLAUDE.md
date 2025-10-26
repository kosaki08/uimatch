# CLAUDE.md

> **This document assumes @AGENTS.md as the foundation.**
> For project overview, development commands, tech stack, architecture, and other common information, refer to @AGENTS.md.

This file contains **Claude Code** specific instructions.

---

## Claude-Specific Guidelines

### Tool Usage

- Use the `TodoWrite` tool proactively to track multi-step tasks
- Use `Read` tool before editing files
- Prefer specialized tools (`Read`, `Edit`, `Write`) over bash commands for file operations
- Run `bun run format` after making code changes
- Run `bun run lint` before committing

### Commit Workflow

When creating commits:

1. Review changes with `git status` and `git diff --staged`
2. Ensure commit messages follow Conventional Commits (see @AGENTS.md)
3. Write commit messages in English
4. Include the Claude Code attribution footer

### Communication

- Be concise and technical in responses
- Provide file paths with line numbers when referencing code (e.g., `src/foo.ts:42`)
- Ask clarifying questions rather than making assumptions
