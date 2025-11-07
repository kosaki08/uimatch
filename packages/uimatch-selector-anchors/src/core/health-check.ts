/**
 * Health check implementation for the selector-anchors plugin
 *
 * @module core/health-check
 */

/**
 * Health check result
 */
export interface HealthCheckResult {
  /**
   * Overall health status
   */
  healthy: boolean;

  /**
   * Human-readable message describing health status
   */
  message: string;

  /**
   * Optional list of issues found during health check
   */
  issues?: string[];
}

/**
 * Perform health check for the plugin
 *
 * Validates:
 * 1. TypeScript compiler availability (required)
 * 2. parse5 HTML parser availability (optional, for HTML support)
 *
 * @returns Health check result with status and issues
 *
 * @example
 * ```typescript
 * const health = await performHealthCheck();
 * if (!health.healthy) {
 *   console.error('Plugin health issues:', health.issues);
 * }
 * ```
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const issues: string[] = [];

  // 1) TypeScript is required (if this passes, core functionality works)
  let tsOk = false;
  try {
    const ts = await import('typescript');
    const src = 'const x: number = 42;';
    const sf = ts.createSourceFile('test.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    tsOk = !!sf && sf.statements.length > 0;
    if (!tsOk) {
      issues.push('TypeScript parser is available but failed to parse test code');
    }
  } catch (e) {
    issues.push(`TypeScript dependency issue: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) parse5 is optional (only needed for HTML path)
  //    Also absorb module shape differences
  let p5Warn = false;
  try {
    const mod: unknown = await import('parse5');

    // Type guard helper
    const hasProperty = (obj: unknown, prop: string): boolean =>
      typeof obj === 'object' && obj !== null && prop in obj;

    const parse =
      hasProperty(mod, 'parse') && typeof (mod as Record<string, unknown>).parse === 'function'
        ? (mod as Record<string, unknown>).parse
        : hasProperty(mod, 'default') &&
            typeof (mod as Record<string, unknown>).default === 'function'
          ? (mod as Record<string, unknown>).default
          : hasProperty(mod, 'default') &&
              hasProperty((mod as Record<string, unknown>).default, 'parse') &&
              typeof ((mod as Record<string, unknown>).default as Record<string, unknown>).parse ===
                'function'
            ? ((mod as Record<string, unknown>).default as Record<string, unknown>).parse
            : null;

    if (!parse) {
      p5Warn = true;
      issues.push('parse5 present but parse() function not found (module shape mismatch).');
    } else {
      const doc: unknown = (parse as (html: string) => unknown)('<div class="test">Hello</div>');
      const ok = hasProperty(doc, 'childNodes');
      if (!ok) {
        p5Warn = true;
        issues.push('parse5 parsed document but structure looks unexpected');
      }
    }
  } catch (e) {
    p5Warn = true;
    // This is "optional". We keep the info but don't fail healthy.
    issues.push(`parse5 optional check failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3) Decision policy:
  //    - TypeScript OK → healthy = true
  //    - parse5 is treated as a warning (included in issues but not reflected in healthy)
  //    - For strict enforcement, use environment variable
  const strictHtml = process.env.UIMATCH_HEALTHCHECK_STRICT_HTML === 'true';
  const healthy = tsOk && (!strictHtml || !p5Warn);

  return {
    healthy,
    message: healthy
      ? 'Plugin is healthy and ready to use'
      : 'Plugin has dependency or parsing issues',
    issues: issues.length ? issues : undefined,
  };
}
