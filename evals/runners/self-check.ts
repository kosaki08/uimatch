import { compareVariant, createFixtureContext, evaluateFinalProposal } from '../harness.js';
import { loadManifest } from '../manifest.js';
import type { RepairProposal } from '../types.js';
import { buildCli } from './build-cli.js';

export async function runSelfCheck(): Promise<void> {
  buildCli();
  const manifest = await loadManifest();
  const mutation = manifest.mutations[0];
  const acceptedRepair = mutation?.rootCause.acceptedRepairs[0];
  if (!mutation || !acceptedRepair) {
    throw new Error('Eval self-check requires one mutation with an accepted repair');
  }
  const context = await createFixtureContext(manifest, mutation);
  try {
    const actualMetadata = context.reference.metadata;
    const expectedMetadata = manifest.reference.expectedMetadata;
    const metadataMatches =
      actualMetadata.childCount === expectedMetadata.childCount &&
      actualMetadata.height === expectedMetadata.height &&
      actualMetadata.width === expectedMetadata.width &&
      actualMetadata.padding.every((value, index) => value === expectedMetadata.padding[index]);
    if (!metadataMatches) {
      throw new Error(
        `Reference metadata does not match manifest: ${JSON.stringify(context.reference.metadata)}`
      );
    }
    const referenceComparison = await compareVariant(
      manifest,
      context.server,
      context.server.referenceUrl,
      context.reference.pngB64,
      manifest.reference.expectedSpec
    );
    if (!referenceComparison.pass || referenceComparison.styleDiffs.length !== 0) {
      throw new Error('Reference self-comparison did not pass cleanly');
    }

    const initialComparison = await compareVariant(
      manifest,
      context.server,
      context.server.workspaceImplementationUrl,
      context.reference.pngB64,
      manifest.reference.expectedSpec
    );
    if (initialComparison.pass) {
      throw new Error('Mutation self-check unexpectedly passed before repair');
    }

    const rootProposal: RepairProposal = {
      changes: acceptedRepair,
      diagnosis: 'self-check root repair',
    };
    await context.workspace.applyProposal(rootProposal);
    const repairedComparison = await compareVariant(
      manifest,
      context.server,
      context.server.workspaceImplementationUrl,
      context.reference.pngB64,
      manifest.reference.expectedSpec
    );
    const accepted = await evaluateFinalProposal({
      finalComparison: repairedComparison,
      manifest,
      mutation,
      perturbationReferences: context.perturbationReferences,
      proposal: rootProposal,
      server: context.server,
    });
    if (!accepted.accepted || !accepted.rootCauseRepaired) {
      throw new Error('Hidden acceptance rejected the applied manifest ground truth');
    }

    const repairWithSymptom: RepairProposal = {
      changes: [
        ...acceptedRepair,
        { property: 'width', selector: manifest.selector, value: '96px' },
      ],
      diagnosis: 'self-check repair with symptom patch',
    };
    await context.workspace.applyProposal(repairWithSymptom);
    const symptomComparison = await compareVariant(
      manifest,
      context.server,
      context.server.workspaceImplementationUrl,
      context.reference.pngB64,
      manifest.reference.expectedSpec
    );
    const rejected = await evaluateFinalProposal({
      finalComparison: symptomComparison,
      manifest,
      mutation,
      perturbationReferences: context.perturbationReferences,
      proposal: repairWithSymptom,
      server: context.server,
    });
    if (
      rejected.accepted ||
      !rejected.finalComparisonPassed ||
      !rejected.rootCauseRepaired ||
      rejected.symptomPatchCount !== 1 ||
      rejected.perturbationsSurvived.length === rejected.perturbationsEvaluated
    ) {
      throw new Error('Hidden perturbations did not reject an applied symptom patch');
    }

    let unsafeProposalRejected = false;
    try {
      await context.workspace.applyProposal({
        changes: [
          { property: 'background-image', selector: manifest.selector, value: 'url(https://x)' },
        ],
        diagnosis: 'self-check unsafe proposal',
      });
    } catch (error) {
      unsafeProposalRejected = error instanceof RangeError;
    }
    if (!unsafeProposalRejected) {
      throw new Error('Repair workspace accepted an unsafe CSS proposal');
    }

    console.log(
      `Eval self-check passed: ${manifest.fixtureId}, repaired DFS ${repairedComparison.metrics.dfs}`
    );
  } finally {
    await context.close();
  }
}
