#!/usr/bin/env node
/**
 * Guard script: Verify TypeScript project references configuration
 *
 * Enforces rules:
 * 1. Packages referenced by others MUST have composite=true
 * 2. Packages referenced by others MUST NOT have noEmit=true
 * 3. All references must point to valid packages
 *
 * Exits with code 1 if any violations found.
 */

import fs from 'node:fs';
import path from 'node:path';

const pkgsDir = path.join(process.cwd(), 'packages');
const readTsConfig = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const errors = [];
const warnings = [];

// Get all package directories
const packages = fs
  .readdirSync(pkgsDir)
  .filter((d) => fs.statSync(path.join(pkgsDir, d)).isDirectory());

// Build map of which packages are referenced by others
const referencedBy = new Map();

for (const pkgName of packages) {
  const tsconfigPath = path.join(pkgsDir, pkgName, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) continue;

  const tsconfig = readTsConfig(tsconfigPath);
  const references = tsconfig.references || [];

  for (const ref of references) {
    const refPath = ref.path.replace(/^\.\.\/|^\.\//g, '');
    const dependents = referencedBy.get(refPath) || [];
    dependents.push(pkgName);
    referencedBy.set(refPath, dependents);
  }
}

// Verify each referenced package has correct configuration
for (const [pkgName, dependents] of referencedBy.entries()) {
  const tsconfigPath = path.join(pkgsDir, pkgName, 'tsconfig.json');

  if (!fs.existsSync(tsconfigPath)) {
    errors.push(
      `[${pkgName}] Referenced by [${dependents.join(', ')}] but tsconfig.json not found`
    );
    continue;
  }

  const tsconfig = readTsConfig(tsconfigPath);
  const compilerOptions = tsconfig.compilerOptions || {};

  // Rule 1: composite must be true
  if (compilerOptions.composite !== true) {
    errors.push(
      `[${pkgName}] Referenced by [${dependents.join(', ')}] but composite is not true (got: ${compilerOptions.composite})`
    );
  }

  // Rule 2: noEmit must NOT be true
  if (compilerOptions.noEmit === true) {
    errors.push(
      `[${pkgName}] Referenced by [${dependents.join(', ')}] but noEmit=true (conflicting with composite)`
    );
  }

  // Warning: declaration should be true for referenced packages
  if (!compilerOptions.declaration) {
    warnings.push(
      `[${pkgName}] Referenced by [${dependents.join(', ')}] but declaration is not set`
    );
  }

  // Warning: outDir should be set for type emission
  if (compilerOptions.declaration && !compilerOptions.outDir) {
    warnings.push(`[${pkgName}] Has declaration=true but outDir is not set`);
  }
}

// Verify all references point to valid packages
for (const pkgName of packages) {
  const tsconfigPath = path.join(pkgsDir, pkgName, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) continue;

  const tsconfig = readTsConfig(tsconfigPath);
  const references = tsconfig.references || [];

  for (const ref of references) {
    const refPath = ref.path.replace(/^\.\.\/|^\.\//g, '');
    const refTsconfigPath = path.join(pkgsDir, refPath, 'tsconfig.json');

    if (!fs.existsSync(refTsconfigPath)) {
      errors.push(
        `[${pkgName}] References invalid package: ${refPath} (tsconfig not found at ${refTsconfigPath})`
      );
    }
  }
}

// Report results
console.log('='.repeat(80));
console.log('TypeScript Project References Verification');
console.log('='.repeat(80));

if (warnings.length > 0) {
  console.log('\n⚠️  Warnings:');
  warnings.forEach((w) => console.log(`  ${w}`));
}

if (errors.length > 0) {
  console.log('\n❌ Errors:');
  errors.forEach((e) => console.log(`  ${e}`));
  console.log('\n' + '='.repeat(80));
  console.log('TypeScript reference guard FAILED');
  console.log('='.repeat(80));
  process.exit(1);
}

console.log('\n✅ All TypeScript project references are correctly configured');
console.log('='.repeat(80));
