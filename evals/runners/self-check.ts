import { runCodexExecSelfCheck } from '../backends/codex-exec-self-check.js';
import { runOpenRouterRetrySelfCheck } from '../backends/openrouter.js';
import { compareVariant, createFixtureContext, evaluateFinalProposal } from '../harness.js';
import { loadManifest } from '../manifest.js';
import { parseRepairProposal } from '../repair-proposal.js';
import { conditionOrderForTrial, type RepairProposal } from '../types.js';
import { buildCli } from './build-cli.js';
import { runReportContractSelfCheck } from './report.js';

export async function runSelfCheck(): Promise<void> {
  const rotatedConditions = [1, 2, 3].map((trial) => conditionOrderForTrial(trial).join(','));
  if (
    rotatedConditions.join('|') !==
    'pixel-diff,scalar,flat-diff|scalar,flat-diff,pixel-diff|flat-diff,pixel-diff,scalar'
  ) {
    throw new Error('Eval condition rotation self-check failed');
  }
  try {
    parseRepairProposal(
      {
        changes: [{ property: 'padding', selector: '.button', value: '8px 16px' }],
        diagnosis: 'padding drift',
        hiddenOracle: 'must not be accepted',
      },
      'self-check proposal'
    );
    throw new Error('Eval proposal contract self-check did not reject an unexpected field');
  } catch (error) {
    if (!(error instanceof TypeError) || !error.message.includes('unexpected fields')) throw error;
  }
  await runOpenRouterRetrySelfCheck();
  await runCodexExecSelfCheck();
  runReportContractSelfCheck();
  buildCli();
  const manifest = await loadManifest();
  const mutation = manifest.mutations[0];
  const acceptedRepair = mutation?.rootCause.acceptedRepairs[0];
  if (!mutation || !acceptedRepair) {
    throw new Error('Eval self-check requires one mutation with an accepted repair');
  }
  const context = await createFixtureContext(manifest, mutation);
  try {
    const referenceComparison = await compareVariant({
      expectedSpec: manifest.reference.expectedSpec,
      manifest,
      purpose: 'visible',
      referencePngB64: context.reference.pngB64,
      server: context.server,
      story: context.server.referenceUrl,
    });
    if (!referenceComparison.visible.pass || referenceComparison.styleDiffs.length !== 0) {
      throw new Error('Reference self-comparison did not pass cleanly');
    }

    const initialComparison = await compareVariant({
      expectedSpec: manifest.reference.expectedSpec,
      manifest,
      purpose: 'visible',
      referencePngB64: context.reference.pngB64,
      server: context.server,
      story: context.server.workspaceImplementationUrl,
    });
    if (initialComparison.visible.pass) {
      throw new Error('Mutation self-check unexpectedly passed before repair');
    }

    const rootProposal: RepairProposal = {
      changes: acceptedRepair,
      diagnosis: 'self-check root repair',
    };
    await context.workspace.applyProposal(rootProposal);
    const repairedComparison = await compareVariant({
      expectedSpec: manifest.reference.expectedSpec,
      manifest,
      purpose: 'visible',
      referencePngB64: context.reference.pngB64,
      server: context.server,
      story: context.server.workspaceImplementationUrl,
    });
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

    const firstPerturbation = manifest.perturbations[0];
    if (!firstPerturbation) throw new Error('Eval self-check requires one perturbation');
    const metadataMismatch = await evaluateFinalProposal({
      finalComparison: repairedComparison,
      manifest: {
        ...manifest,
        perturbations: [
          {
            ...firstPerturbation,
            expectedMetadata: {
              ...firstPerturbation.expectedMetadata,
              width: firstPerturbation.expectedMetadata.width + 1,
            },
          },
        ],
      },
      mutation,
      perturbationReferences: context.perturbationReferences,
      proposal: rootProposal,
      server: context.server,
    });
    if (
      metadataMismatch.accepted ||
      metadataMismatch.perturbationsSurvived.length === metadataMismatch.perturbationsEvaluated
    ) {
      throw new Error('Hidden acceptance ignored a perturbation metadata mismatch');
    }

    const repairWithSymptom: RepairProposal = {
      changes: [
        ...acceptedRepair,
        { property: 'width', selector: manifest.selector, value: '96px' },
      ],
      diagnosis: 'self-check repair with symptom patch',
    };
    await context.workspace.applyProposal(repairWithSymptom);
    const symptomComparison = await compareVariant({
      expectedSpec: manifest.reference.expectedSpec,
      manifest,
      purpose: 'visible',
      referencePngB64: context.reference.pngB64,
      server: context.server,
      story: context.server.workspaceImplementationUrl,
    });
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
      rejected.unmatchedChangeCount !== 1 ||
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
      `Eval self-check passed: ${manifest.fixtureId}, repaired DFS ${repairedComparison.visible.dfs}`
    );
  } finally {
    await context.close();
  }
}
