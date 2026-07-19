import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI_PATH = join(import.meta.dir, '../index.ts');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects a non-numeric concurrency value', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'uimatch-suite-validation-'));
  tempDirs.push(tempDir);

  const suitePath = join(tempDir, 'suite.json');
  const outDir = join(tempDir, 'out');
  writeFileSync(
    suitePath,
    JSON.stringify({
      items: [
        {
          name: 'should-not-run',
          figma: 'bypass:test',
          story: 'data:text/html,<div id="target"></div>',
          selector: '#target',
        },
      ],
    })
  );

  const result = spawnSync(
    'bun',
    [CLI_PATH, 'suite', `path=${suitePath}`, `outDir=${outDir}`, 'concurrency=auto'],
    {
      encoding: 'utf8',
      env: { ...process.env, UIMATCH_LOG_LEVEL: 'silent' },
      timeout: 10_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
});
