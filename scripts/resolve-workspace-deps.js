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

// Resolve workspace:* to actual versions from workspace packages
if (pkg.dependencies) {
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    if (version === 'workspace:*') {
      // Map package name to directory name
      const dirMap = {
        '@uimatch/shared-logging': 'shared-logging',
        '@uimatch/selector-spi': 'uimatch-selector-spi',
        '@uimatch/selector-anchors': 'uimatch-selector-anchors',
        'uimatch-core': 'uimatch-core',
        'uimatch-scoring': 'uimatch-scoring',
        'uimatch-plugin': 'uimatch-plugin',
      };

      const dirName = dirMap[name];
      if (!dirName) {
        console.error(`Unknown workspace package: ${name}`);
        process.exit(1);
      }

      const workspacePackagePath = join(__dirname, '..', 'packages', dirName, 'package.json');

      try {
        const workspacePkg = JSON.parse(readFileSync(workspacePackagePath, 'utf8'));
        pkg.dependencies[name] = workspacePkg.version;
        console.log(`Resolved ${name}: workspace:* -> ${workspacePkg.version}`);
      } catch (err) {
        console.error(`Failed to resolve ${name}:`, err.message);
        process.exit(1);
      }
    }
  }
}

writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ Workspace dependencies resolved');
