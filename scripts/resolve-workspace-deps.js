#!/usr/bin/env node
/**
 * Resolves workspace:* dependencies to actual versions for npm pack compatibility
 * Usage: node scripts/resolve-workspace-deps.js <package-dir>
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = process.argv[2];

if (!packageDir) {
  console.error('Usage: node resolve-workspace-deps.js <package-dir>');
  process.exit(1);
}

const packageJsonPath = join(packageDir, 'package.json');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

// Map package name to directory name
const dirMap = {
  '@uimatch/shared-logging': 'shared-logging',
  '@uimatch/selector-spi': 'uimatch-selector-spi',
  '@uimatch/selector-anchors': 'uimatch-selector-anchors',
  'uimatch-core': 'uimatch-core',
  'uimatch-scoring': 'uimatch-scoring',
  'uimatch-plugin': 'uimatch-plugin',
};

/**
 * Resolve workspace:* in a specific dependency field
 */
function resolveField(fieldName) {
  if (!pkg[fieldName]) return;

  for (const [name, version] of Object.entries(pkg[fieldName])) {
    if (version === 'workspace:*') {
      const dirName = dirMap[name];
      if (!dirName) {
        console.error(`Unknown workspace package: ${name}`);
        process.exit(1);
      }

      const workspacePackagePath = join(__dirname, '..', 'packages', dirName, 'package.json');

      try {
        const workspacePkg = JSON.parse(readFileSync(workspacePackagePath, 'utf8'));
        pkg[fieldName][name] = workspacePkg.version || '^0.0.0';
        console.log(`Resolved ${fieldName}.${name}: workspace:* -> ${pkg[fieldName][name]}`);
      } catch (err) {
        console.error(`Failed to resolve ${name}:`, err.message);
        process.exit(1);
      }
    }
  }
}

// Resolve workspace:* in all dependency fields
resolveField('dependencies');
resolveField('peerDependencies');
resolveField('devDependencies');

writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ Workspace dependencies resolved');
