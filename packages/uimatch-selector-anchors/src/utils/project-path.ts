import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export function resolveProjectPath(anchorsPath: string, file: string): string {
  if (isAbsolute(file)) return file;
  return resolve(dirname(anchorsPath), file);
}

export async function resolveProjectPathWithinRoot(
  anchorsPath: string,
  file: string,
  projectRoot: string
): Promise<string> {
  const [canonicalRoot, canonicalFile] = await Promise.all([
    realpath(projectRoot),
    realpath(resolveProjectPath(anchorsPath, file)),
  ]);
  const relativePath = relative(canonicalRoot, canonicalFile);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Anchor source file must be inside project root: ${canonicalRoot}`);
  }
  return canonicalFile;
}
