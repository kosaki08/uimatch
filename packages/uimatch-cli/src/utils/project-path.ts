import { access, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class ProjectPathError extends Error {
  override readonly name = 'ProjectPathError';
}

function assertPathWithinRoot(projectRoot: string, targetPath: string, label: string): void {
  const relativePath = relative(projectRoot, targetPath);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new ProjectPathError(`${label} must be inside project root: ${projectRoot}`);
  }
}

async function findGitRoot(startPath: string): Promise<string | undefined> {
  let current = startPath;
  while (true) {
    try {
      await access(join(current, '.git'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}

export async function resolveProjectRoot(
  explicitRoot: string | undefined,
  cwd = process.cwd()
): Promise<string> {
  const canonicalCwd = await realpath(cwd);
  if (!explicitRoot) return (await findGitRoot(canonicalCwd)) ?? canonicalCwd;

  const canonicalRoot = await realpath(resolve(canonicalCwd, explicitRoot)).catch((cause) => {
    throw new ProjectPathError(`Project root does not exist: ${explicitRoot}`, { cause });
  });
  const rootStat = await stat(canonicalRoot);
  if (!rootStat.isDirectory()) {
    throw new ProjectPathError(`Project root is not a directory: ${explicitRoot}`);
  }
  return canonicalRoot;
}

export async function resolveExistingProjectPath(
  projectRoot: string,
  inputPath: string,
  label: string,
  cwd = process.cwd()
): Promise<string> {
  const absolutePath = resolve(cwd, inputPath);
  const canonicalPath = await realpath(absolutePath).catch((cause) => {
    throw new ProjectPathError(`${label} does not exist: ${inputPath}`, { cause });
  });
  assertPathWithinRoot(projectRoot, canonicalPath, label);
  return canonicalPath;
}
