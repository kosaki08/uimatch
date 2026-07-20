import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { artifactDirectory, parseArtifactPolicy, writeComparisonArtifacts } from '../artifacts.js';
import { compareVariant, createFixtureContext, replayPerturbation } from '../harness.js';
import { evalRoot, loadManifest } from '../manifest.js';
import {
  evalIdentifierPattern,
  evalRunIdPattern,
  expectedMetadataMatches,
  visibleComparisonMatches,
  type EvalArtifactPolicy,
  type EvalArtifacts,
  type EvalResult,
  type RepairProposal,
} from '../types.js';
import { buildCli, EvalUsageError } from './build-cli.js';
import { loadEvalRunResults, type StoredEvalResult } from './report.js';

function parseRunId(args: string[]): string {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (normalized.length !== 2 || normalized[0] !== '--run' || !normalized[1]) {
    throw new EvalUsageError('Usage: pnpm eval:artifacts -- --run YYYYMMDD_<run-id>');
  }
  if (!evalRunIdPattern.test(normalized[1])) {
    throw new EvalUsageError('Artifact run ID must use YYYYMMDD_<name>.');
  }
  return normalized[1];
}

function finalProposal(result: EvalResult): RepairProposal | undefined {
  return [...result.turnRecords].reverse().find((record) => record.proposal)?.proposal;
}

async function replaceResultArtifacts(
  stored: StoredEvalResult,
  artifacts: EvalArtifacts
): Promise<void> {
  const temporary = `${stored.path}.${randomUUID()}.tmp`;
  await mkdir(dirname(stored.path), { recursive: true });
  await writeFile(temporary, `${JSON.stringify({ ...stored.raw, artifacts }, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  try {
    await rename(temporary, stored.path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function generateResultArtifacts(
  stored: StoredEvalResult,
  requestedPolicy: Exclude<EvalArtifactPolicy, 'none'>
): Promise<boolean> {
  const policy = stored.result.artifacts?.policy === 'all' ? 'all' : requestedPolicy;
  const proposal = finalProposal(stored.result);
  const finalMetrics = stored.result.finalComparison;
  const outcomes = stored.result.acceptance?.perturbationOutcomes;
  if (!proposal || !finalMetrics || !outcomes) return false;
  if (
    !evalIdentifierPattern.test(stored.result.fixtureId) ||
    !evalIdentifierPattern.test(stored.result.mutationId)
  ) {
    throw new TypeError('Eval result contains unsafe fixture or mutation identifiers');
  }

  const manifest = await loadManifest(
    resolve(evalRoot, 'manifests', `${stored.result.fixtureId}.json`)
  );
  const mutation = manifest.mutations.find(
    (candidate) => candidate.id === stored.result.mutationId
  );
  if (!mutation) {
    throw new Error(`Manifest omitted mutation ${stored.result.mutationId}`);
  }
  const identity = {
    condition: stored.result.condition,
    fixtureId: stored.result.fixtureId,
    mutationId: stored.result.mutationId,
    runId: stored.result.runId,
    trial: stored.result.trial,
  };
  const directory = artifactDirectory(identity);
  const fixture = await createFixtureContext(manifest, mutation);
  try {
    const turns: EvalArtifacts['turns'] = {};
    if (policy === 'all') {
      for (const record of stored.result.turnRecords) {
        if (!record.proposal || !record.visibleComparison) continue;
        await fixture.workspace.applyProposal(record.proposal);
        const comparison = await compareVariant({
          expectedSpec: manifest.reference.expectedSpec,
          manifest,
          purpose: 'visible',
          referencePngB64: fixture.reference.pngB64,
          server: fixture.server,
          story: fixture.server.workspaceImplementationUrl,
        });
        if (!visibleComparisonMatches(comparison.visible, record.visibleComparison)) {
          throw new Error(
            `${stored.result.condition} turn ${record.turn} no longer reproduces its recorded metrics`
          );
        }
        turns[String(record.turn)] = await writeComparisonArtifacts(
          directory,
          {
            diff: `turn-${record.turn}-diff.png`,
            implementation: `turn-${record.turn}.png`,
            reference: 'reference.png',
          },
          comparison
        );
      }
    }

    await fixture.workspace.applyProposal(proposal);
    const finalComparison = await compareVariant({
      expectedSpec: manifest.reference.expectedSpec,
      manifest,
      purpose: 'visible',
      referencePngB64: fixture.reference.pngB64,
      server: fixture.server,
      story: fixture.server.workspaceImplementationUrl,
    });
    if (!visibleComparisonMatches(finalComparison.visible, finalMetrics)) {
      throw new Error(`${stored.result.condition} no longer reproduces its recorded final metrics`);
    }
    const final = await writeComparisonArtifacts(
      directory,
      { diff: 'final-diff.png', implementation: 'final.png', reference: 'reference.png' },
      finalComparison
    );

    const perturbations: NonNullable<EvalArtifacts['perturbations']> = {};
    for (const outcome of outcomes) {
      if (policy === 'failures' && outcome.passed) continue;
      const perturbation = manifest.perturbations.find((candidate) => candidate.id === outcome.id);
      const story = fixture.server.workspacePerturbationUrls.get(outcome.id);
      const reference = fixture.perturbationReferences.get(outcome.id);
      if (!perturbation || !story || !reference) {
        throw new Error(`Perturbation replay inputs are incomplete for ${outcome.id}`);
      }
      const replay = await replayPerturbation({
        manifest,
        perturbation,
        reference,
        server: fixture.server,
        story,
      });
      if (
        !visibleComparisonMatches(replay.comparison.visible, outcome.comparison) ||
        !expectedMetadataMatches(replay.metadata, outcome.actualMetadata)
      ) {
        throw new Error(
          `${stored.result.condition}/${outcome.id} no longer reproduces its recorded outcome`
        );
      }
      perturbations[outcome.id] = {
        ...(await writeComparisonArtifacts(
          directory,
          {
            diff: `${outcome.id}-diff.png`,
            implementation: `${outcome.id}.png`,
            reference: `${outcome.id}-reference.png`,
          },
          replay.comparison
        )),
        passed: outcome.passed,
      };
    }

    await replaceResultArtifacts(stored, {
      final,
      ...(Object.keys(perturbations).length === 0 ? {} : { perturbations }),
      policy,
      ...(Object.keys(turns).length === 0 ? {} : { turns }),
    });
    return true;
  } finally {
    await fixture.close();
  }
}

async function main(): Promise<void> {
  const runId = parseRunId(process.argv.slice(2));
  let policy: EvalArtifactPolicy;
  try {
    policy = parseArtifactPolicy(process.env.EVAL_ARTIFACT_POLICY);
  } catch (error) {
    if (error instanceof RangeError) throw new EvalUsageError(error.message);
    throw error;
  }
  if (policy === 'none') {
    console.log('Eval artifact policy is none; no artifacts were generated.');
    return;
  }
  let results: StoredEvalResult[];
  try {
    results = await loadEvalRunResults(runId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new EvalUsageError(`No eval results found for run ${runId}.`);
    }
    throw error;
  }
  if (results.length === 0) throw new EvalUsageError(`No eval results found for run ${runId}.`);
  buildCli();
  let generated = 0;
  const skipped: string[] = [];
  for (const result of results) {
    if (await generateResultArtifacts(result, policy)) generated += 1;
    else {
      skipped.push(
        `${result.result.fixtureId}/${result.result.mutationId}/${result.result.condition}/trial-${result.result.trial}`
      );
    }
  }
  console.log(`Generated audit artifacts for ${generated}/${results.length} eval results.`);
  if (skipped.length > 0) {
    throw new Error(
      `Cannot replay results without a final evaluated proposal: ${skipped.join(', ')}`
    );
  }
}

function handleMainError(error: unknown): void {
  if (error instanceof EvalUsageError) {
    console.error(`Eval artifact error: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  void main().catch(handleMainError);
}
