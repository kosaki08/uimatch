import { browserPool } from '@uimatch/core';
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSuite, runWithConcurrency } from '../suite';

const CLI_PATH = join(import.meta.dir, '../index.ts');
const FIGMA_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
const TEXT_GATE_WARNING =
  'textGate is enabled but textCheck is not active; using the visual quality gate.';
const tempDirs: string[] = [];

afterEach(() => {
  mock.restore();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const VALID_ITEM = {
  name: 'should-not-run',
  figma: 'bypass:test',
  story: 'data:text/html,<div id="target"></div>',
  selector: '#target',
};
const VALID_SUITE = JSON.stringify({ items: [VALID_ITEM] });

function runSuiteCli(suiteContents: string, concurrency?: string) {
  const tempDir = mkdtempSync(join(tmpdir(), 'uimatch-suite-validation-'));
  tempDirs.push(tempDir);

  const suitePath = join(tempDir, 'suite.json');
  const outDir = join(tempDir, 'out');
  writeFileSync(suitePath, suiteContents);

  const args = [CLI_PATH, 'suite', `path=${suitePath}`, `outDir=${outDir}`];
  if (concurrency !== undefined) args.push(`concurrency=${concurrency}`);

  const result = spawnSync('bun', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      UIMATCH_FIGMA_PNG_B64: FIGMA_PNG_B64,
      UIMATCH_LOG_LEVEL: 'silent',
    },
    timeout: 10_000,
  });

  return { ...result, outDir };
}

test.each(['', 'auto', '0', '-1', '4abc', '1.5', '9007199254740992'])(
  'rejects invalid concurrency value %s',
  (concurrency) => {
    const result = runSuiteCli(VALID_SUITE, concurrency);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Invalid concurrency');
  }
);

test.each([JSON.stringify({}), JSON.stringify({ items: [] })])(
  'rejects missing or empty suite items',
  (suiteContents) => {
    const result = runSuiteCli(suiteContents);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('items must be a non-empty array');
  }
);

test('rejects malformed suite JSON', () => {
  const result = runSuiteCli('{"items":');

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('Invalid suite JSON');
});

test.each([
  [
    'defaults.textGate',
    JSON.stringify({
      defaults: { textGate: 'true' },
      items: [VALID_ITEM],
    }),
  ],
  [
    'items[0].textGate',
    JSON.stringify({
      items: [{ ...VALID_ITEM, textGate: 'true' }],
    }),
  ],
])('rejects non-boolean suite textGate at %s', (field, suiteContents) => {
  const result = runSuiteCli(suiteContents);

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain(`${field} must be a boolean`);
});

test.each([0, -1, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'runWithConcurrency rejects invalid internal limit %p',
  async (limit) => {
    let rejection: unknown;
    try {
      await runWithConcurrency([1], limit, (value) => Promise.resolve(value));
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(RangeError);
    expect((rejection as Error).message).toBe(
      'Concurrency limit must be a positive safe integer'
    );
  }
);

test('runWithConcurrency preserves item order', async () => {
  const results = await runWithConcurrency([3, 1, 2], 2, (value) => Promise.resolve(value * 2));

  expect(results).toEqual([6, 2, 4]);
});

test(
  'records a warning when textGate falls back to the visual quality gate',
  () => {
    const suite = JSON.stringify({
      items: [
        {
          name: 'text-gate-fallback',
          figma: 'bypass:test',
          story: `data:text/html,${encodeURIComponent(
            '<div id="target" style="width:10px;height:10px;background:red"></div>'
          )}`,
          selector: '#target',
          size: 'pad',
          dpr: 1,
          textGate: true,
        },
      ],
    });

    const result = runSuiteCli(suite);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(TEXT_GATE_WARNING);

    const report = JSON.parse(readFileSync(join(result.outDir, 'suite-report.json'), 'utf8')) as {
      items: Array<{ warnings?: string[] }>;
    };
    expect(report.items[0]?.warnings).toEqual([TEXT_GATE_WARNING]);
  },
  { timeout: 15_000 }
);

test('runSuite closes the browser pool on a usage error', async () => {
  const closeAll = spyOn(browserPool, 'closeAll').mockResolvedValue();

  const exitCode = await runSuite([]);

  expect(exitCode).toBe(2);
  expect(closeAll).toHaveBeenCalledTimes(1);
});
