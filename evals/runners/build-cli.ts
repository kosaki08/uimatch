import { spawnSync } from 'node:child_process';

export class EvalUsageError extends Error {}

export function buildCli(): void {
  const pnpmEntrypoint = process.env.npm_execpath;
  if (!pnpmEntrypoint) {
    throw new EvalUsageError('Run eval commands through pnpm.');
  }
  const result = spawnSync(process.execPath, [pnpmEntrypoint, 'run', 'build'], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm run build failed with exit code ${result.status ?? 1}`);
  }
}
