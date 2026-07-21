#!/usr/bin/env node
/**
 * Run `changeset version` for the public packages.
 *
 * On 0.x a caret range pins the minor, so bumping a package that another one
 * peer-depends on would push Changesets into a major bump of the dependent.
 * Widening the ranges in the repository instead would leave npm unable to
 * satisfy the peer, which it answers by dropping the package from an install
 * with only a warning. So the widening happens here, only for the bump.
 *
 * Versioning also consumes changesets and writes changelogs, so git is the
 * transaction journal: clean tree in, rollback on failure.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES_DIR = 'packages';
const OWNED_PATHS = [PACKAGES_DIR, '.changeset', 'pnpm-lock.yaml'];

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status ?? result.signal}`);
  }
}

function manifestPaths() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name, 'package.json'))
    .filter((path) => existsSync(path));
}

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, manifest) => writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);

/** Everything a consumer sees, so a change here has to ship under a new version. */
function publishedShape(manifest) {
  const { version, ...rest } = manifest;
  return JSON.stringify(rest);
}

const dirty = git(['status', '--porcelain', '--', ...OWNED_PATHS]).trim();
if (dirty) {
  console.error('Refusing to version with local changes to:');
  console.error(dirty);
  console.error('Commit or stash them first; this script rolls these paths back on failure.');
  process.exit(1);
}

const paths = manifestPaths();
const originals = new Map(paths.map((path) => [path, read(path)]));
const publicNames = new Set(
  [...originals.values()].filter((manifest) => !manifest.private).map((manifest) => manifest.name)
);
const versionBefore = new Map(
  [...originals.values()].map((manifest) => [manifest.name, manifest.version])
);

/** Peer ranges between public workspace packages; those are the ones that escalate. */
const internalPeers = (manifest) =>
  Object.keys(manifest.peerDependencies ?? {}).filter((name) => publicNames.has(name));

try {
  for (const [path, original] of originals) {
    const peers = internalPeers(original);
    if (peers.length === 0) continue;
    const relaxed = structuredClone(original);
    for (const name of peers) relaxed.peerDependencies[name] = '*';
    write(path, relaxed);
  }

  run('pnpm', ['exec', 'changeset', 'version']);

  const versionByName = new Map(paths.map((path) => [read(path).name, read(path).version]));
  const bumped = new Map(
    [...versionByName].filter(([name, version]) => versionBefore.get(name) !== version)
  );

  if (bumped.size === 0) {
    console.log('No package versions changed; leaving the working tree untouched.');
    restore();
    process.exit(0);
  }

  for (const path of paths) {
    const manifest = read(path);
    const peers = internalPeers(manifest);
    if (peers.length === 0) continue;
    for (const name of peers) manifest.peerDependencies[name] = `^${versionByName.get(name)}`;
    write(path, manifest);
  }

  run('pnpm', [
    'exec',
    'prettier',
    '--write',
    '--log-level',
    'warn',
    `${PACKAGES_DIR}/*/package.json`,
  ]);

  // A package whose published manifest moved but whose version did not would
  // ship its new dependency graph under a version that is already on npm.
  const stale = paths.filter((path) => {
    const original = originals.get(path);
    const final = read(path);
    return final.version === original.version && publishedShape(final) !== publishedShape(original);
  });

  if (stale.length > 0) {
    throw new Error(
      `These packages changed without a version bump:\n${stale
        .map((path) => `  ${read(path).name} (${path})`)
        .join('\n')}\nAdd a changeset for each of them and run this again.`
    );
  }

  for (const [name, version] of bumped) console.log(`${name} -> ${version}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  try {
    restore();
    console.error('Rolled the working tree back.');
  } catch (rollbackError) {
    console.error(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
    console.error(
      `Rollback failed. ${OWNED_PATHS.join(', ')} may be half-versioned; reset them by hand.`
    );
  }
  process.exit(1);
}

/**
 * Undo whatever `changeset version` wrote. A rollback that itself fails leaves a
 * half-versioned tree, so say so instead of reporting a clean state.
 */
function restore() {
  git(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...OWNED_PATHS]);
  git(['clean', '-fdq', '--', ...OWNED_PATHS]);
}
