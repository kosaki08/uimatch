/**
 * The programmatic API must not keep the Node process alive.
 * A returned CompareResult is not enough evidence: a leaked browser only shows
 * up as a process that never exits, so every path is run in its own process.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  BROWSER_FIXTURE_VIEWPORT_SIZE,
  RED_10X10_PNG_B64,
  RED_TARGET_STORY_URL,
} from '../test-utils/browser-fixtures.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const cliEntry = join(repositoryRoot, 'packages/uimatch-cli/dist/index.js');
const EXIT_TIMEOUT_MS = 60_000;

const STUB_PLUGIN = `
export default {
  name: 'natural-exit-stub',
  version: '1.0.0',
  async resolve(context) {
    await context.probe.check(context.initialSelector);
    return { selector: context.initialSelector, stabilityScore: 100 };
  },
};
`;

/** Comparison arguments shared by every path; only browser ownership differs. */
function compareArgsLiteral(extra: string): string {
  return `{
    figma: 'bypass:test',
    story: ${JSON.stringify(RED_TARGET_STORY_URL)},
    selector: '#target',
    sizeMode: 'pad',
    viewport: { width: ${BROWSER_FIXTURE_VIEWPORT_SIZE}, height: ${BROWSER_FIXTURE_VIEWPORT_SIZE} },
    dpr: 1,
    ${extra}
  }`;
}

/**
 * Run a script and resolve once the process exits on its own.
 * The script must never call process.exit(), otherwise a leak would be masked.
 */
async function runUntilNaturalExit(
  scriptPath: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      UIMATCH_FIGMA_PNG_B64: RED_10X10_PNG_B64,
      UIMATCH_HEADLESS: 'true',
      UIMATCH_LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => (stdout += chunk));
  child.stderr.on('data', (chunk: string) => (stderr += chunk));

  return await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectPromise(
        new Error(
          `Process did not exit within ${EXIT_TIMEOUT_MS}ms (leaked browser?)\n` +
            `stdout: ${stdout}\nstderr: ${stderr}`
        )
      );
    }, EXIT_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

const cases: Array<{ name: string; build: (pluginPath: string) => string }> = [
  {
    name: 'without a selector plugin',
    build: () => `
import { uiMatchCompare } from ${JSON.stringify(cliEntry)};
const result = await uiMatchCompare(${compareArgsLiteral('')});
process.stdout.write(result.summary);
`,
  },
  {
    name: 'with a selector plugin',
    build: (pluginPath: string) => `
import { uiMatchCompare } from ${JSON.stringify(cliEntry)};
const result = await uiMatchCompare(${compareArgsLiteral(`selectorsPlugin: ${JSON.stringify(pluginPath)},`)});
process.stdout.write(result.summary);
`,
  },
  {
    name: 'with reuseBrowser after closeUiMatchBrowsers()',
    build: () => `
import { closeUiMatchBrowsers, uiMatchCompare } from ${JSON.stringify(cliEntry)};
try {
  const result = await uiMatchCompare(${compareArgsLiteral('reuseBrowser: true,')});
  process.stdout.write(result.summary);
} finally {
  await closeUiMatchBrowsers();
}
`,
  },
];

test.each(cases)(
  'uiMatchCompare exits naturally $name',
  { timeout: 120_000 },
  async ({ build }) => {
    const workDirectory = await mkdtemp(join(tmpdir(), 'uimatch-natural-exit-'));

    try {
      const pluginPath = join(workDirectory, 'stub-plugin.mjs');
      await writeFile(pluginPath, STUB_PLUGIN);

      const scriptPath = join(workDirectory, 'run.mjs');
      await writeFile(scriptPath, build(pluginPath));

      const result = await runUntilNaturalExit(scriptPath);

      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('DFS');
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
);
