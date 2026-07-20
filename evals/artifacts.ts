import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { evalRoot } from './manifest.js';
import {
  evalArtifactPolicies,
  evalIdentifierPattern,
  evalRunIdPattern,
  type ComparisonSnapshot,
  type ConditionId,
  type EvalArtifactFile,
  type EvalArtifactPolicy,
  type EvalComparisonArtifacts,
} from './types.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface ArtifactIdentity {
  condition: ConditionId;
  fixtureId: string;
  mutationId: string;
  runId: string;
  trial: number;
}

export function parseArtifactPolicy(value: string | undefined): EvalArtifactPolicy {
  const policy = value?.trim() || 'failures';
  if (!evalArtifactPolicies.some((candidate) => candidate === policy)) {
    throw new RangeError('EVAL_ARTIFACT_POLICY must be none, failures, or all');
  }
  return policy as EvalArtifactPolicy;
}

export function artifactDirectory(identity: ArtifactIdentity): string {
  const identifiers = [identity.fixtureId, identity.mutationId, identity.condition];
  if (
    !evalRunIdPattern.test(identity.runId) ||
    !identifiers.every((identifier) => evalIdentifierPattern.test(identifier)) ||
    !Number.isSafeInteger(identity.trial) ||
    identity.trial < 1
  ) {
    throw new RangeError('Eval artifact identifiers must be safe path segments');
  }
  return resolve(
    evalRoot,
    'artifacts',
    identity.runId,
    identity.fixtureId,
    identity.mutationId,
    identity.condition,
    `trial-${identity.trial}`
  );
}

function decodePng(base64: string, label: string): Buffer {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < pngSignature.length || !bytes.subarray(0, 8).equals(pngSignature)) {
    throw new TypeError(`${label} is not a PNG image`);
  }
  return bytes;
}

async function writeImmutableFile(path: string, bytes: Buffer): Promise<void> {
  try {
    const existing = await readFile(path);
    if (existing.equals(bytes)) return;
    throw new Error(`Artifact already exists with different content: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  try {
    await link(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await readFile(path);
    if (!existing.equals(bytes)) {
      throw new Error(`Artifact already exists with different content: ${path}`);
    }
  } finally {
    await unlink(temporary);
  }
}

async function writePng(path: string, base64: string, label: string): Promise<EvalArtifactFile> {
  const bytes = decodePng(base64, label);
  await writeImmutableFile(path, bytes);
  return {
    path: relative(evalRoot, path).split(sep).join('/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function writeComparisonArtifacts(
  directory: string,
  names: { diff: string; implementation: string; reference: string },
  comparison: ComparisonSnapshot
): Promise<EvalComparisonArtifacts> {
  const [reference, implementation, diff] = await Promise.all([
    writePng(
      resolve(directory, names.reference),
      comparison.artifacts.figmaPngB64,
      'reference artifact'
    ),
    writePng(
      resolve(directory, names.implementation),
      comparison.artifacts.implPngB64,
      'implementation artifact'
    ),
    writePng(
      resolve(directory, names.diff),
      comparison.artifacts.diffPngB64,
      'difference artifact'
    ),
  ]);
  return { diff, implementation, reference };
}
