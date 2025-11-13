#!/usr/bin/env node
/**
 * Diagnostic script: Print TypeScript compiler flags for all packages
 *
 * Outputs critical flags that affect project references and build:
 * - composite: Required for referenced packages
 * - noEmit: Must be false for packages that emit types
 * - emitDeclarationOnly: Should be true for packages that only emit types
 * - declaration/declarationMap: Required for type emission
 * - rootDir/outDir: Control file organization
 */

import fs from 'node:fs';
import path from 'node:path';

const pkgsDir = path.join(process.cwd(), 'packages');
const targets = fs
  .readdirSync(pkgsDir)
  .filter((d) => fs.statSync(path.join(pkgsDir, d)).isDirectory());

const criticalFlags = [
  'composite',
  'noEmit',
  'emitDeclarationOnly',
  'declaration',
  'declarationMap',
  'rootDir',
  'outDir',
];

console.log('='.repeat(80));
console.log('TypeScript Compiler Flags per Package');
console.log('='.repeat(80));

for (const pkgName of targets) {
  const tsconfigPath = path.join(pkgsDir, pkgName, 'tsconfig.json');

  if (!fs.existsSync(tsconfigPath)) {
    console.log(`\n[${pkgName}] ⚠️  No tsconfig.json found`);
    continue;
  }

  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  const compilerOptions = tsconfig.compilerOptions || {};

  // Extract critical flags
  const flags = {};
  for (const flag of criticalFlags) {
    flags[flag] = compilerOptions[flag];
  }

  // Extract references
  const references = Array.isArray(tsconfig.references)
    ? tsconfig.references.map((r) => r.path)
    : [];

  console.log(`\n[${pkgName}]`);
  console.log('  Flags:', JSON.stringify(flags, null, 2).replace(/\n/g, '\n  '));
  console.log('  References:', references.length > 0 ? references : 'none');

  // Warnings
  const warnings = [];
  if (references.length > 0 && !flags.composite) {
    warnings.push('⚠️  Referenced by others but composite=false');
  }
  if (flags.composite && flags.noEmit === true) {
    warnings.push('⚠️  composite=true with noEmit=true (conflicting)');
  }
  if (flags.declaration && !flags.outDir) {
    warnings.push('⚠️  declaration=true without outDir');
  }

  if (warnings.length > 0) {
    console.log('  Issues:');
    warnings.forEach((w) => console.log(`    ${w}`));
  }
}

console.log('\n' + '='.repeat(80));
