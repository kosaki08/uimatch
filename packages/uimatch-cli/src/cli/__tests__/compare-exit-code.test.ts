import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CLI_PATH = join(import.meta.dir, '../index.ts');
const FIGMA_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
const DIFFERENT_HTML = `data:text/html,${encodeURIComponent(
  '<div id="target" style="width:10px;height:10px;background:blue"></div>'
)}`;

test(
  'claude format preserves a failing quality gate exit code',
  () => {
    const result = spawnSync(
      'bun',
      [
        CLI_PATH,
        'compare',
        'figma=bypass:test',
        `story=${DIFFERENT_HTML}`,
        'selector=#target',
        'size=pad',
        'dpr=1',
        'format=claude',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          UIMATCH_FIGMA_PNG_B64: FIGMA_PNG_B64,
          UIMATCH_LOG_LEVEL: 'silent',
        },
        timeout: 15_000,
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('=== LLM-Formatted Output ===');
    expect(result.stderr).toContain('Gate: ❌ FAIL');
  },
  { timeout: 20_000 }
);

test('rejects an unknown quality gate profile before comparison', () => {
  const result = spawnSync(
    'bun',
    [
      CLI_PATH,
      'compare',
      'figma=bypass:test',
      `story=${DIFFERENT_HTML}`,
      'selector=#target',
      'profile=does-not-exist',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, UIMATCH_LOG_LEVEL: 'silent' },
      timeout: 10_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("Quality gate profile 'does-not-exist' not found");
});
