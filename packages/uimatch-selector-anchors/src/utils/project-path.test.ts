import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { resolveProjectPathWithinRoot } from './project-path.js';

const tempDirectories: string[] = [];

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'uimatch-anchor-root-'));
  tempDirectories.push(root);
  await mkdir(join(root, '.uimatch'));
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

test('allows source files relative to a nested anchors file', async () => {
  const root = await createProject();
  const sourcePath = join(root, 'src', 'Button.tsx');
  await mkdir(join(root, 'src'));
  await writeFile(sourcePath, 'export const Button = () => null;');

  await expect(
    resolveProjectPathWithinRoot(join(root, '.uimatch', 'anchors.json'), '../src/Button.tsx', root)
  ).resolves.toBe(sourcePath);
});

test('rejects an absolute source file outside the project root', async () => {
  const root = await createProject();
  const outsideRoot = await mkdtemp(join(tmpdir(), 'uimatch-anchor-outside-'));
  tempDirectories.push(outsideRoot);
  const outsidePath = join(outsideRoot, 'Button.tsx');
  await writeFile(outsidePath, 'export const Button = () => null;');

  await expect(
    resolveProjectPathWithinRoot(join(root, '.uimatch', 'anchors.json'), outsidePath, root)
  ).rejects.toThrow('Anchor source file must be inside project root');
});

test('rejects a source symlink that escapes the project root', async () => {
  const root = await createProject();
  const outsideRoot = await mkdtemp(join(tmpdir(), 'uimatch-anchor-outside-'));
  tempDirectories.push(outsideRoot);
  const outsidePath = join(outsideRoot, 'Button.tsx');
  const linkPath = join(root, 'Button.tsx');
  await writeFile(outsidePath, 'export const Button = () => null;');
  await symlink(outsidePath, linkPath);

  await expect(
    resolveProjectPathWithinRoot(join(root, '.uimatch', 'anchors.json'), '../Button.tsx', root)
  ).rejects.toThrow('Anchor source file must be inside project root');
});
