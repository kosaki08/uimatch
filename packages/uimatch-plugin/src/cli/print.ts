/**
 * CLI output utilities for human-readable text output
 * Separate from structured logging (pino) for different use cases:
 * - print utilities: human-readable CLI output (stdout/stderr)
 * - logger: structured logging for debugging and monitoring
 */

/**
 * Write line to stdout (for normal CLI output)
 */
export const outln = (...parts: unknown[]): void => {
  process.stdout.write(parts.map(String).join(' ') + '\n');
};

/**
 * Write line to stderr (for errors and warnings)
 */
export const errln = (...parts: unknown[]): void => {
  process.stderr.write(parts.map(String).join(' ') + '\n');
};
