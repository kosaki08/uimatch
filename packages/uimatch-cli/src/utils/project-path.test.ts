import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  ProjectPathError,
  resolveExistingProjectPath,
  resolveProjectRoot,
} from './project-path.js';

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'uimatch-project-path-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

test('discovers the nearest git root from a nested directory', async () => {
  const root = await createTempDirectory();
  const nested = join(root, 'packages', 'app');
  await mkdir(join(root, '.git'));
  await mkdir(nested, { recursive: true });

  await expect(resolveProjectRoot(undefined, nested)).resolves.toBe(root);
});

test('uses the canonical cwd when no git root exists', async () => {
  const root = await createTempDirectory();

  await expect(resolveProjectRoot(undefined, root)).resolves.toBe(root);
});

test('prefers an explicit project root', async () => {
  const parent = await createTempDirectory();
  const root = join(parent, 'explicit-root');
  const cwd = join(parent, 'work');
  await mkdir(root);
  await mkdir(cwd);

  await expect(resolveProjectRoot('../explicit-root', cwd)).resolves.toBe(root);
});

test('accepts an existing file inside the project root', async () => {
  const root = await createTempDirectory();
  const anchorsPath = join(root, '.uimatch', 'anchors.json');
  await mkdir(join(root, '.uimatch'));
  await writeFile(anchorsPath, '{"anchors":[]}');

  await expect(
    resolveExistingProjectPath(root, '.uimatch/anchors.json', 'selectors path', root)
  ).resolves.toBe(anchorsPath);
});

test('rejects a path outside the project root', async () => {
  const parent = await createTempDirectory();
  const root = join(parent, 'project');
  const outsidePath = join(parent, 'outside.json');
  await mkdir(root);
  await writeFile(outsidePath, '{}');

  await expect(
    resolveExistingProjectPath(root, '../outside.json', 'selectors path', root)
  ).rejects.toBeInstanceOf(ProjectPathError);
});

test('rejects a symlink that escapes the project root', async () => {
  const parent = await createTempDirectory();
  const root = join(parent, 'project');
  const outsidePath = join(parent, 'outside.json');
  const linkPath = join(root, 'anchors.json');
  await mkdir(root);
  await writeFile(outsidePath, '{}');
  await symlink(outsidePath, linkPath);

  await expect(
    resolveExistingProjectPath(root, 'anchors.json', 'selectors path', root)
  ).rejects.toBeInstanceOf(ProjectPathError);
});
