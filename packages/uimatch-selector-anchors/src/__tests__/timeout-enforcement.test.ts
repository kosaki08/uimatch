/**
 * B: Hang Detection Tests
 * Purpose: Verify timeouts are enforced and prevent hangs
 * Tests that components respect timeout settings and return quickly
 */

import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFromTypeScript } from '../resolvers/ast-resolver.js';

// Create a fixture directory for large test files
const fixtureDir = join(tmpdir(), `uimatch-timeout-tests-${Date.now()}`);
mkdirSync(fixtureDir, { recursive: true });

// Generate a large TypeScript file to stress the parser
const largeTsxContent = `
import React from 'react';
${Array.from({ length: 100 }, (_, i) => `const Component${i} = () => <div data-testid="test${i}">Content ${i}</div>;`).join('\n')}
export default function App() {
  return (
    <div>
      ${Array.from({ length: 100 }, (_, i) => `<Component${i} />`).join('\n      ')}
    </div>
  );
}
`;

const largeFilePath = join(fixtureDir, 'large.tsx');
writeFileSync(largeFilePath, largeTsxContent, 'utf8');

/**
 * B-1: AST resolver respects timeouts
 * 極端に短いタイムアウトでも、必ず結果を返す（ハングしない）
 */
test('B-1: AST resolver enforces timeouts quickly', async () => {
  const originalEnv = { ...process.env };

  try {
    // Set extremely short timeouts
    process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = '10';
    process.env.UIMATCH_AST_ATTR_TIMEOUT_MS = '20';
    process.env.UIMATCH_AST_FULL_TIMEOUT_MS = '30';

    const startTime = Date.now();

    // This should timeout and fall back to heuristics
    const result = await resolveFromTypeScript(largeFilePath, 100, 0).catch(() => {
      // If it throws, that's also acceptable (fail-closed)
      return null;
    });

    const elapsed = Date.now() - startTime;

    // Key assertion: must return within reasonable time (< 1 second)
    expect(elapsed).toBeLessThan(1000);

    // If result is returned, it should have a reason explaining the fallback
    if (result) {
      expect(Array.isArray(result.reasons)).toBe(true);
    }
  } finally {
    // Restore environment
    Object.assign(process.env, originalEnv);
  }
});

/**
 * B-2: Multiple timeout scenarios
 * 異なるタイムアウト設定でも安全に動作する
 */
test('B-2: handles various timeout configurations', async () => {
  const scenarios = [
    { fast: '50', attr: '100', full: '150' },
    { fast: '1', attr: '2', full: '3' },
    { fast: '100', attr: '200', full: '300' },
  ];

  for (const scenario of scenarios) {
    const originalEnv = { ...process.env };

    try {
      process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = scenario.fast;
      process.env.UIMATCH_AST_ATTR_TIMEOUT_MS = scenario.attr;
      process.env.UIMATCH_AST_FULL_TIMEOUT_MS = scenario.full;

      const startTime = Date.now();
      const result = await resolveFromTypeScript(largeFilePath, 100, 0).catch(() => null);
      const elapsed = Date.now() - startTime;

      // Should complete quickly regardless of timeout settings
      const maxExpected = Math.max(
        Number(scenario.fast),
        Number(scenario.attr),
        Number(scenario.full)
      );
      expect(elapsed).toBeLessThan(maxExpected + 500); // 500ms grace period for overhead

      // Result should be valid or null (never hang)
      if (result) {
        expect(typeof result).toBe('object');
      }
    } finally {
      Object.assign(process.env, originalEnv);
    }
  }
});

/**
 * B-3: Fallback always returns valid structure
 * タイムアウトで heuristics にフォールバックした際も、
 * 必ず有効な構造を返す（null or valid result）
 */
test('B-3: fallback provides valid structure', async () => {
  const originalEnv = { ...process.env };

  try {
    // Force heuristics fallback with minimal timeouts
    process.env.UIMATCH_AST_FAST_PATH_TIMEOUT_MS = '1';
    process.env.UIMATCH_AST_ATTR_TIMEOUT_MS = '1';
    process.env.UIMATCH_AST_FULL_TIMEOUT_MS = '1';

    const result = await resolveFromTypeScript(largeFilePath, 100, 0).catch(() => null);

    // Key P0 assertion: must not hang, must return something (null or valid structure)
    if (result) {
      expect(typeof result).toBe('object');
      expect(Array.isArray(result.selectors)).toBe(true);
      expect(Array.isArray(result.reasons)).toBe(true);
    }
    // If result is null, that's also acceptable (fail-closed behavior)
  } finally {
    Object.assign(process.env, originalEnv);
  }
});
