import 'dotenv/config';

import { spawnSync } from 'node:child_process';

const requiredEnvironment = [
  'FIGMA_ACCESS_TOKEN',
  'UIMATCH_FIGMA_SMOKE_FILE_KEY',
  'UIMATCH_FIGMA_SMOKE_ATOMIC_NODE_ID',
  'UIMATCH_FIGMA_SMOKE_COMPOSITE_NODE_ID',
] as const;

function failUsage(message: string): never {
  console.error(`Figma smoke configuration error: ${message}`);
  process.exit(2);
}

for (const name of requiredEnvironment) {
  if (!process.env[name]?.trim()) {
    failUsage(`${name} is required. See e2e/figma/README.md.`);
  }
}

const fileKey = process.env.UIMATCH_FIGMA_SMOKE_FILE_KEY;
const nodeIds = [
  process.env.UIMATCH_FIGMA_SMOKE_ATOMIC_NODE_ID,
  process.env.UIMATCH_FIGMA_SMOKE_COMPOSITE_NODE_ID,
];

if (!fileKey || !/^[A-Za-z0-9_-]+$/.test(fileKey)) {
  failUsage('UIMATCH_FIGMA_SMOKE_FILE_KEY has an invalid format.');
}

for (const nodeId of nodeIds) {
  if (!nodeId || !/^\d+[:-]\d+$/.test(nodeId)) {
    failUsage('Figma smoke node IDs must use the page:node or page-node format.');
  }
}

const pnpmEntrypoint = process.env.npm_execpath;
if (!pnpmEntrypoint) {
  failUsage('run this suite through pnpm run test:figma-smoke.');
}

function runPnpm(args: readonly string[]): number {
  const result = spawnSync(process.execPath, [pnpmEntrypoint, ...args], {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Failed to run pnpm ${args.join(' ')}: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

const buildStatus = runPnpm(['run', 'build']);
if (buildStatus !== 0) {
  process.exit(buildStatus);
}

process.exit(runPnpm(['exec', 'vitest', 'run', '--config', 'vitest.figma-smoke.config.ts']));
