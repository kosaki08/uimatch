# GEMINI.md

> **This document assumes AGENTS.md as the foundation.**
> For project overview, development commands, tech stack, architecture, and other common information, refer to AGENTS.md.

This file contains **Gemini** specific instructions.

---

## Gemini-Specific Guidelines

### Code Generation

- Always generate TypeScript code with explicit types
- **Never use `any` type** - it will cause ESLint errors
- Follow the project's Prettier configuration (single quotes, semicolons, etc.)
- Organize imports automatically (handled by prettier-plugin-organize-imports)

### File Operations

- Read existing files before suggesting modifications
- Provide complete file contents when suggesting changes
- Include proper TypeScript types and JSDoc comments for public APIs

### Commit Messages

When suggesting commits, use this format:

```
<type>: <subject>

<body>

🤖 Generated with Gemini

Co-Authored-By: Gemini <noreply@google.com>
```

Follow Conventional Commits specification (see AGENTS.md for details).

**Example:**

```
feat: implement screenshot comparison logic

Add pixelmatch-based image diffing with configurable
threshold and antialiasing detection for UI screenshots.

🤖 Generated with Gemini

Co-Authored-By: Gemini <noreply@google.com>
```

### Development Workflow

1. **Understand requirements**: Ask clarifying questions if needed
2. **Check existing code**: Review related files and patterns
3. **Write code**:
   - Use TypeScript strict mode (no `any`)
   - Follow ESLint and Prettier rules
   - Write descriptive variable and function names in English
4. **Suggest verification**:
   - Recommend running `bun run format` after changes
   - Recommend running `bun run lint` before commits

### Communication Style

- Be precise and technical
- Use markdown code blocks with language specifiers
- Provide file paths when discussing code
- Explain complex algorithms or design decisions
- Suggest best practices aligned with the project's tech stack

## Important Reminders

- ✅ Always use English for code, comments, and commits
- ✅ Never use `any` type (use `unknown` or specific types)
- ✅ Follow Conventional Commits for commit messages
- ✅ Run formatter and linter before suggesting commits
- ✅ Read AGENTS.md for complete project guidelines
