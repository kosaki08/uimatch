/**
 * Debug logging utility with DEBUG environment variable support
 *
 * Respects DEBUG=uimatch:* pattern for conditional logging
 */

/**
 * Check if debug logging is enabled for a given namespace
 */
function isDebugEnabled(namespace: string): boolean {
  const debugEnv = process.env.DEBUG;
  if (!debugEnv) {
    return false;
  }

  // Support wildcards: DEBUG=uimatch:* or DEBUG=*
  const patterns = debugEnv.split(',').map((p) => p.trim());

  for (const pattern of patterns) {
    if (pattern === '*') {
      return true;
    }

    // Convert glob pattern to regex
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/:/g, ':');
    const regex = new RegExp(`^${regexPattern}$`);

    if (regex.test(namespace)) {
      return true;
    }
  }

  return false;
}

/**
 * Create a debug logger for a specific namespace
 *
 * @param namespace - Debug namespace (e.g., 'uimatch:selector-anchors')
 * @returns Debug logging functions
 */
export function createDebugger(namespace: string) {
  const enabled = isDebugEnabled(namespace);

  return {
    /**
     * Log debug message (only if DEBUG is enabled)
     */
    debug: (...args: unknown[]) => {
      if (enabled) {
        const line = `[${namespace}] ${args.map(String).join(' ')}\n`;
        process.stdout.write(line);
      }
    },

    /**
     * Log warning message (always shown)
     */
    warn: (...args: unknown[]) => {
      const line = `[${namespace}] ${args.map(String).join(' ')}\n`;
      process.stderr.write(line);
    },

    /**
     * Log error message (always shown)
     */
    error: (...args: unknown[]) => {
      const line = `[${namespace}] ${args.map(String).join(' ')}\n`;
      process.stderr.write(line);
    },

    /**
     * Check if debug logging is enabled
     */
    isEnabled: () => enabled,
  };
}

/**
 * Default logger for selector-anchors package
 */
export const logger = createDebugger('uimatch:selector-anchors');
