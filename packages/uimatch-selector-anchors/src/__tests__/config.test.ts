import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getConfig } from '../types/config.js';

describe('Configuration', () => {
  // Store original env values
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original env values
    const envVars = [
      'UIMATCH_AST_FAST_PATH_TIMEOUT_MS',
      'UIMATCH_AST_ATTR_TIMEOUT_MS',
      'UIMATCH_AST_FULL_TIMEOUT_MS',
      'UIMATCH_PROBE_TIMEOUT_MS',
      'UIMATCH_HTML_PARSE_TIMEOUT_MS',
      'UIMATCH_SNIPPET_MATCH_TIMEOUT_MS',
    ];

    for (const key of envVars) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env values
    for (const key of Object.keys(originalEnv)) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  test('should return default timeout values when no env vars set', () => {
    const config = getConfig();

    expect(config.timeouts.astFastPath).toBe(300);
    expect(config.timeouts.astAttr).toBe(600);
    expect(config.timeouts.astFull).toBe(900);
    expect(config.timeouts.probe).toBe(600);
    expect(config.timeouts.htmlParse).toBe(300);
    expect(config.timeouts.snippetMatch).toBe(50);
  });

  test('should override AST timeout values from environment variables', () => {
    process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = '100';
    process.env.UIMATCH_AST_ATTR_TIMEOUT_MS = '200';
    process.env.UIMATCH_AST_FULL_TIMEOUT_MS = '400';

    const config = getConfig();

    expect(config.timeouts.astFastPath).toBe(100);
    expect(config.timeouts.astAttr).toBe(200);
    expect(config.timeouts.astFull).toBe(400);
  });

  test('should override all timeout values from environment variables', () => {
    process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = '150';
    process.env.UIMATCH_AST_ATTR_TIMEOUT_MS = '300';
    process.env.UIMATCH_AST_FULL_TIMEOUT_MS = '600';
    process.env.UIMATCH_PROBE_TIMEOUT_MS = '500';
    process.env.UIMATCH_HTML_PARSE_TIMEOUT_MS = '250';
    process.env.UIMATCH_SNIPPET_MATCH_TIMEOUT_MS = '75';

    const config = getConfig();

    expect(config.timeouts.astFastPath).toBe(150);
    expect(config.timeouts.astAttr).toBe(300);
    expect(config.timeouts.astFull).toBe(600);
    expect(config.timeouts.probe).toBe(500);
    expect(config.timeouts.htmlParse).toBe(250);
    expect(config.timeouts.snippetMatch).toBe(75);
  });

  test('should use default values for invalid environment variable values', () => {
    process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = 'invalid';
    process.env.UIMATCH_AST_ATTR_TIMEOUT_MS = '-100';
    process.env.UIMATCH_AST_FULL_TIMEOUT_MS = '0';

    const config = getConfig();

    // Should fallback to defaults for invalid values
    expect(config.timeouts.astFastPath).toBe(300);
    expect(config.timeouts.astAttr).toBe(600);
    expect(config.timeouts.astFull).toBe(900);
  });

  test('should handle partial environment variable configuration', () => {
    // Only set one env var
    process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = '500';

    const config = getConfig();

    // Should use custom value for set var
    expect(config.timeouts.astFastPath).toBe(500);

    // Should use defaults for unset vars
    expect(config.timeouts.astAttr).toBe(600);
    expect(config.timeouts.astFull).toBe(900);
  });
});
