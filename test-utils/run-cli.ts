import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
export const cliPath = join(repositoryRoot, 'packages/uimatch-cli/dist/cli/index.js');

export function cliProcessArgs(args: readonly string[]): string[] {
  return [cliPath, ...args];
}
