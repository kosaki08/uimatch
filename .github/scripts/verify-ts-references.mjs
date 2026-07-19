#!/usr/bin/env node

/**
 * Verify that production TypeScript builds use explicit build configurations.
 */

import fs from 'node:fs';
import path from 'node:path';

const packagesDir = path.join(process.cwd(), 'packages');
const configName = 'tsconfig.build.json';
const errors = [];
const warnings = [];

const packageNames = fs
  .readdirSync(packagesDir)
  .filter((name) => fs.statSync(path.join(packagesDir, name)).isDirectory());

for (const packageName of packageNames) {
  const packageDir = path.join(packagesDir, packageName);
  const configPath = path.join(packageDir, configName);

  if (!fs.existsSync(configPath)) {
    errors.push(`[${packageName}] ${configName} is missing`);
    continue;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const compilerOptions = config.compilerOptions ?? {};

  if (compilerOptions.composite !== true) {
    errors.push(`[${packageName}] ${configName} must set composite=true`);
  }
  if (compilerOptions.noEmit === true) {
    errors.push(`[${packageName}] ${configName} must not set noEmit=true`);
  }
  if (compilerOptions.declaration !== true) {
    warnings.push(`[${packageName}] ${configName} does not set declaration=true`);
  }
  if (typeof compilerOptions.outDir !== 'string') {
    warnings.push(`[${packageName}] ${configName} does not set outDir`);
  }

  for (const reference of config.references ?? []) {
    const referencePath = path.resolve(packageDir, reference.path);
    if (!fs.existsSync(referencePath)) {
      errors.push(`[${packageName}] references missing config: ${reference.path}`);
    }
  }
}

for (const warning of warnings) {
  console.warn(`TypeScript reference warning: ${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`TypeScript reference error: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log('TypeScript build references verified');
}
