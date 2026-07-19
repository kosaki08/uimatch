#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const errors = [];
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

if (
  typeof packageJson.packageManager !== 'string' ||
  !packageJson.packageManager.startsWith('pnpm@')
) {
  errors.push('package.json must declare pnpm in packageManager');
}

if (!existsSync('pnpm-lock.yaml')) {
  errors.push('pnpm-lock.yaml is missing');
}

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const forbiddenLockfiles = new Set(['bun.lock', 'bun.lockb', 'package-lock.json', 'yarn.lock']);
const trackedForbiddenLockfiles = trackedFiles.filter((file) =>
  forbiddenLockfiles.has(file.split('/').at(-1))
);

if (trackedForbiddenLockfiles.length > 0) {
  errors.push(`forbidden lockfiles are tracked: ${trackedForbiddenLockfiles.join(', ')}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`Package manager policy violation: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log('Package manager policy verified');
}
