import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const packagesRoot = resolve(repositoryRoot, 'packages');
const destination = resolve(repositoryRoot, process.argv[2] ?? 'dist-packages');

await mkdir(destination, { recursive: true });

const packageDirectories = (await readdir(packagesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));

for (const directory of packageDirectories) {
  const packageDirectory = resolve(packagesRoot, directory.name);
  const packageJsonPath = resolve(packageDirectory, 'package.json');
  let packageJson;

  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }

  if (packageJson.private === true) {
    console.log(`Skipping private package ${packageJson.name ?? directory.name}`);
    continue;
  }

  console.log(`Packing ${packageJson.name ?? directory.name}`);
  const result = spawnSync('pnpm', ['pack', '--pack-destination', destination], {
    cwd: packageDirectory,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
