import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { cliProcessArgs } from '../../../../../test-utils/run-cli.js';

const CLI_PACKAGE_PATH = join(import.meta.dirname, '../../../package.json');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor reports the CLI version outside the project directory', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'uimatch-doctor-cwd-'));
  tempDirs.push(cwd);
  const outDir = join(cwd, 'doctor-output');

  const result = spawnSync(
    process.execPath,
    cliProcessArgs([
      'doctor',
      '--select',
      'env',
      '--offline',
      '--format',
      'json',
      '--out-dir',
      outDir,
    ]),
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, UIMATCH_LOG_LEVEL: 'silent' },
      timeout: 10_000,
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);

  const [runDir] = readdirSync(outDir);
  if (!runDir) throw new Error('Doctor did not create a report directory');
  const report = JSON.parse(readFileSync(join(outDir, runDir, 'report.json'), 'utf8')) as {
    generator: { version: string };
  };
  const cliPackage = JSON.parse(readFileSync(CLI_PACKAGE_PATH, 'utf8')) as { version: string };

  expect(report.generator.version).toBe(cliPackage.version);
});
