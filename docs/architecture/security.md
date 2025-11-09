# Security Guidelines

This document describes security best practices and requirements for uiMatch.

## Secret Management

- Do **not** print or commit secrets (tokens, credentials, cookies)
- Configuration must be injected via environment variables and typed schema (e.g., zod)
- Never embed base64 images or secrets in commit messages, code, or PR descriptions
- Use `.gitignore` to exclude sensitive files and temporary outputs

## Artifact Handling

- Generated artifacts (screenshots, diffs) are **in-memory by default**
- Persist artifacts only when explicitly approved by the user
- Clean up temporary files after operations complete
- Never commit generated artifacts to version control

## Logging Security

- No PII (Personally Identifiable Information) in logs
- Mask URLs and query params that may contain tokens
- Sanitize error messages before logging
- Use appropriate log levels for sensitive operations

## Environment Variables

Optional secure environment variables:

- `FIGMA_MCP_TOKEN`: Bearer token for Figma MCP authentication (when using MCP mode)
- `BASIC_AUTH_USER`: Basic auth username for target URLs (when targets require authentication)
- `BASIC_AUTH_PASS`: Basic auth password for target URLs (when targets require authentication)

These should never be:

- Hardcoded in source files
- Committed to version control
- Logged or printed to console
- Exposed in error messages

## Ignored Files

Ensure the following are in `.gitignore`:

- `/fixtures/*.png` (test artifacts)
- `/dist` (build outputs)
- Temporary outputs and cache directories
- Any files containing credentials or tokens
