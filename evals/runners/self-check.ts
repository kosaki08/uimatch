import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { parse } from 'postcss';
import { parseArtifactPolicy } from '../artifacts.js';
import { runCodexExecSelfCheck } from '../backends/codex-exec-self-check.js';
import { runOpenRouterRetrySelfCheck } from '../backends/openrouter.js';
import { buildFlatDiffFeedback } from '../conditions/flat-diff.js';
import { buildPixelDiffFeedback } from '../conditions/pixel-diff.js';
import { buildScalarFeedback } from '../conditions/scalar.js';
import {
  buildTypedDiffEvidence,
  buildTypedStyleDiffs,
  type TypedDimensionSignal,
} from '../conditions/typed-diff.js';
import {
  compareVariant,
  createFixtureContext,
  evaluateFinalProposal,
  type FixtureContext,
} from '../harness.js';
import { loadManifest, loadManifestById, resolveEvalPath } from '../manifest.js';
import { parseRepairProposal } from '../repair-proposal.js';
import {
  conditionOrderForTrial,
  evalRunIdPattern,
  type ComparisonSnapshot,
  type EvalManifest,
  type EvalMutation,
  type HiddenAcceptanceResult,
  type RepairProposal,
} from '../types.js';
import { buildCli } from './build-cli.js';
import { runReportContractSelfCheck } from './report.js';

function pathIsWithin(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return (
    relativePath === '' ||
    (!isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${sep}`))
  );
}

// Positive control for the FIXED wiring: the drifted width is authored in the mutation CSS, so
// every condition can repair it without reading the sizing contract. The discriminating case is
// padding-drift-missing-fixed-width, checked by runContractPairSelfCheck.
async function runFixedSizingSelfCheck(): Promise<void> {
  const manifest = await loadManifestById('atomic-button-fixed');
  const mutation = manifest.mutations.find(({ id }) => id === 'width-drift');
  const acceptedRepair = mutation?.rootCause.acceptedRepairs[0];
  if (!mutation || !acceptedRepair) {
    throw new Error('Fixed-size eval self-check requires the width-drift mutation');
  }
  const context = await createFixtureContext(manifest, mutation);
  try {
    const initialComparison = await compareVariant({
      expectedSpec: manifest.reference.expectedSpec,
      manifest,
      purpose: 'visible',
      referencePngB64: context.reference.pngB64,
      server: context.server,
      story: context.server.workspaceImplementationUrl,
    });
    if (initialComparison.visible.pass) {
      throw new Error('Fixed-size mutation unexpectedly passed before repair');
    }
    const evidence = buildTypedDiffEvidence(
      initialComparison,
      manifest.selector,
      context.workspace.implementationSource.css,
      manifest.reference.rootDimensionConstraints
    );
    const horizontal = evidence.dimensionConstraints.find(
      (constraint) => constraint.axis === 'horizontal'
    );
    const width = evidence.styleDiffs
      .find((styleDiff) => styleDiff.isRoot === true)
      ?.properties.find((property) => property.property === 'width');
    if (
      horizontal?.mode !== 'FIXED' ||
      horizontal.source !== 'fixture-contract' ||
      horizontal.actionability !== 'repair-candidate' ||
      width?.dimensionConstraint?.mode !== 'FIXED' ||
      width.actionability !== 'repair-candidate' ||
      width.sourceDeclaration !== 'width'
    ) {
      throw new Error('Typed-diff feedback did not preserve the explicit fixed-width contract');
    }

    for (const mode of ['HUG', 'FILL'] as const) {
      const alternate = buildTypedDiffEvidence(
        initialComparison,
        manifest.selector,
        '',
        manifest.reference.rootDimensionConstraints.map((constraint) =>
          constraint.axis === 'horizontal' ? { ...constraint, mode } : constraint
        )
      ).dimensionConstraints.find((constraint) => constraint.axis === 'horizontal');
      if (alternate?.mode !== mode || alternate.actionability !== 'diagnostic-only') {
        throw new Error(`Typed-diff feedback treated ${mode} geometry as actionable`);
      }
    }

    const authoredWidthUnderHug = buildTypedStyleDiffs(
      initialComparison,
      manifest.selector,
      context.workspace.implementationSource.css,
      manifest.reference.rootDimensionConstraints.map((constraint) =>
        constraint.axis === 'horizontal' ? { ...constraint, mode: 'HUG' as const } : constraint
      )
    )
      .find((styleDiff) => styleDiff.isRoot === true)
      ?.properties.find((property) => property.property === 'width');
    if (authoredWidthUnderHug?.actionability !== 'repair-candidate') {
      throw new Error('Typed-diff feedback hid an authored width under a HUG contract');
    }

    const proposal: RepairProposal = {
      changes: acceptedRepair,
      diagnosis: 'self-check fixed-width repair',
    };
    await context.workspace.applyProposal(proposal);
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
      proposal,
      server: context.server,
    });
    if (!accepted.accepted || accepted.perturbationsSurvived.length !== 1) {
      throw new Error('Hidden acceptance rejected the fixed-width ground truth');
    }

    const intrinsicProposal: RepairProposal = {
      changes: [{ property: 'width', selector: manifest.selector, value: 'auto' }],
      diagnosis: 'self-check incorrect intrinsic sizing',
    };
    await context.workspace.applyProposal(intrinsicProposal);
    const intrinsicComparison = await compareVariant({
      expectedSpec: manifest.reference.expectedSpec,
      manifest,
      purpose: 'visible',
      referencePngB64: context.reference.pngB64,
      server: context.server,
      story: context.server.workspaceImplementationUrl,
    });
    const rejected = await evaluateFinalProposal({
      finalComparison: intrinsicComparison,
      manifest,
      mutation,
      perturbationReferences: context.perturbationReferences,
      proposal: intrinsicProposal,
      server: context.server,
    });
    if (!rejected.finalComparisonPassed || rejected.accepted) {
      throw new Error('Fixed-size perturbation did not reject an intrinsic-width repair');
    }
  } finally {
    await context.close();
  }
}

function rootDeclarations(css: string, rootSelector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  parse(css, { from: undefined }).walkRules((rule) => {
    if (!rule.selectors.some((selector) => selector.trim() === rootSelector)) return;
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop.toLowerCase(), declaration.value.trim());
    });
  });
  return declarations;
}

// A candidate is a copy of its mutation's stylesheet carrying a content delta, so nothing keeps the
// two in sync on its own. Every root declaration the mutation makes must survive into the
// candidate at the same value; the candidate may add more, which is how content deltas land.
async function assertCandidatesTrackTheirMutation(
  manifest: EvalManifest,
  mutation: EvalMutation
): Promise<void> {
  const mutationCss = await readFile(resolveEvalPath(mutation.css), 'utf8');
  const expected = rootDeclarations(mutationCss, manifest.selector);
  for (const [perturbationId, candidate] of mutation.candidates) {
    const candidateCss = await readFile(resolveEvalPath(candidate.css), 'utf8');
    const actual = rootDeclarations(candidateCss, manifest.selector);
    for (const [property, value] of expected) {
      if (actual.get(property) !== value) {
        throw new Error(
          `Candidate ${mutation.id}/${perturbationId} drifted from its mutation on ${property}: expected ${value}, found ${actual.get(property) ?? 'nothing'}`
        );
      }
    }
    if (candidateCss.includes('base.css')) {
      throw new Error(
        `Candidate ${mutation.id}/${perturbationId} imports the oracle base instead of carrying the mutated state`
      );
    }
  }
}

interface ContractPairSide {
  context: FixtureContext;
  initialComparison: ComparisonSnapshot;
  manifest: EvalManifest;
  mutation: EvalMutation;
}

async function openContractPairSide(
  fixtureId: string,
  mutationId: string
): Promise<ContractPairSide> {
  const manifest = await loadManifestById(fixtureId);
  const mutation = manifest.mutations.find(({ id }) => id === mutationId);
  if (!mutation) {
    throw new Error(`Contract-pair self-check requires ${fixtureId}/${mutationId}`);
  }
  const context = await createFixtureContext(manifest, mutation);
  try {
    const initialComparison = await compareVariant({
      expectedSpec: manifest.reference.expectedSpec,
      manifest,
      purpose: 'visible',
      referencePngB64: context.reference.pngB64,
      server: context.server,
      story: context.server.workspaceImplementationUrl,
    });
    if (initialComparison.visible.pass) {
      throw new Error(`Contract-pair mutation ${fixtureId}/${mutationId} passed before repair`);
    }
    return { context, initialComparison, manifest, mutation };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function evaluateContractPairRepair(
  side: ContractPairSide,
  proposal: RepairProposal
): Promise<HiddenAcceptanceResult> {
  await side.context.workspace.applyProposal(proposal);
  const finalComparison = await compareVariant({
    expectedSpec: side.manifest.reference.expectedSpec,
    manifest: side.manifest,
    purpose: 'visible',
    referencePngB64: side.context.reference.pngB64,
    server: side.context.server,
    story: side.context.server.workspaceImplementationUrl,
  });
  return await evaluateFinalProposal({
    finalComparison,
    manifest: side.manifest,
    mutation: side.mutation,
    perturbationReferences: side.context.perturbationReferences,
    proposal,
    server: side.context.server,
  });
}

// Everything an agent sees before the contract is identical on both sides, so a difference in
// behaviour cannot be attributed to anything but the sizing contract.
function assertPairInputsAreIdentical(hug: ContractPairSide, fixed: ContractPairSide): void {
  if (hug.manifest.selector !== fixed.manifest.selector) {
    throw new Error('Contract-pair sides do not share a root selector');
  }
  if (hug.context.reference.pngB64 !== fixed.context.reference.pngB64) {
    throw new Error('Contract-pair references do not render identically');
  }
  if (hug.initialComparison.artifacts.implPngB64 !== fixed.initialComparison.artifacts.implPngB64) {
    throw new Error('Contract-pair mutations do not render identically');
  }
  if (
    hug.context.workspace.implementationSource.css !==
      fixed.context.workspace.implementationSource.css ||
    hug.context.workspace.implementationSource.html !==
      fixed.context.workspace.implementationSource.html
  ) {
    throw new Error('Contract-pair sides do not share the same agent-visible source');
  }
}

// Untyped conditions observe identical payloads on both sides. Typed-diff is the only condition
// that carries the contract, and it must carry opposite actionability across the pair.
function assertOnlyTypedDiffCarriesTheContract(
  hug: ContractPairSide,
  fixed: ContractPairSide
): void {
  const untypedFeedback = (side: ContractPairSide): string =>
    JSON.stringify([
      buildPixelDiffFeedback(side.initialComparison),
      buildScalarFeedback(side.initialComparison),
    ]);
  if (untypedFeedback(hug) !== untypedFeedback(fixed)) {
    throw new Error('Contract-pair pixel-diff or scalar payloads differ across the pair');
  }
  const horizontalSignal = (side: ContractPairSide): TypedDimensionSignal | undefined =>
    buildTypedDiffEvidence(
      side.initialComparison,
      side.manifest.selector,
      side.context.workspace.implementationSource.css,
      side.manifest.reference.rootDimensionConstraints
    ).dimensionConstraints.find((constraint) => constraint.axis === 'horizontal');
  const hugSignal = horizontalSignal(hug);
  const fixedSignal = horizontalSignal(fixed);
  if (
    hugSignal?.mode !== 'HUG' ||
    hugSignal.actionability !== 'diagnostic-only' ||
    fixedSignal?.mode !== 'FIXED' ||
    fixedSignal.actionability !== 'repair-candidate'
  ) {
    throw new Error('Contract-pair typed-diff did not separate the HUG and FIXED contracts');
  }
}

// The FIXED candidate must not carry the width the agent is expected to supply, otherwise hidden
// acceptance cannot observe an omission. Asserted on the source, not only the render.
async function assertFixedCandidatesOmitTheWidth(fixed: ContractPairSide): Promise<void> {
  for (const [perturbationId, candidate] of fixed.mutation.candidates) {
    const candidateCss = await readFile(resolveEvalPath(candidate.css), 'utf8');
    if (rootDeclarations(candidateCss, fixed.manifest.selector).has('width')) {
      throw new Error(
        `Contract-pair candidate ${perturbationId} declares a width on ${fixed.manifest.selector}`
      );
    }
  }
}

// The four cells that define the pair. The same proposal must earn opposite verdicts on each side.
async function assertContractDiscriminationMatrix(
  hug: ContractPairSide,
  fixed: ContractPairSide
): Promise<void> {
  const selector = hug.manifest.selector;
  const paddingOnly: RepairProposal = {
    changes: [{ property: 'padding', selector, value: '8px 16px' }],
    diagnosis: 'contract-pair padding-only repair',
  };
  const paddingAndWidth: RepairProposal = {
    changes: [...paddingOnly.changes, { property: 'width', selector, value: '96px' }],
    diagnosis: 'contract-pair padding and width repair',
  };

  const hugPaddingOnly = await evaluateContractPairRepair(hug, paddingOnly);
  if (!hugPaddingOnly.accepted || !hugPaddingOnly.rootCauseRepaired) {
    throw new Error('Contract-pair HUG side rejected the padding-only ground truth');
  }
  const hugPaddingAndWidth = await evaluateContractPairRepair(hug, paddingAndWidth);
  if (!hugPaddingAndWidth.finalComparisonPassed || hugPaddingAndWidth.accepted) {
    throw new Error('Contract-pair HUG side accepted an added fixed width');
  }

  const fixedPaddingOnly = await evaluateContractPairRepair(fixed, paddingOnly);
  if (
    !fixedPaddingOnly.finalComparisonPassed ||
    fixedPaddingOnly.accepted ||
    fixedPaddingOnly.rootCauseRepaired
  ) {
    throw new Error('Contract-pair FIXED side accepted a padding-only repair');
  }
  const fixedPaddingAndWidth = await evaluateContractPairRepair(fixed, paddingAndWidth);
  if (!fixedPaddingAndWidth.accepted || !fixedPaddingAndWidth.rootCauseRepaired) {
    throw new Error('Contract-pair FIXED side rejected the padding and width ground truth');
  }
}

// The counterfactual pair: atomic-button (HUG) and atomic-button-fixed (FIXED) render identically
// and receive byte-identical mutated HTML and CSS, so only the sizing contract can tell an agent
// which repair is correct. Restoring padding alone is right under HUG and overfits under FIXED;
// also declaring the width is right under FIXED and overfits under HUG.
async function runContractPairSelfCheck(): Promise<void> {
  const hug = await openContractPairSide('atomic-button', 'padding-drift');
  try {
    const fixed = await openContractPairSide(
      'atomic-button-fixed',
      'padding-drift-missing-fixed-width'
    );
    try {
      assertPairInputsAreIdentical(hug, fixed);
      assertOnlyTypedDiffCarriesTheContract(hug, fixed);
      await assertFixedCandidatesOmitTheWidth(fixed);
      await assertContractDiscriminationMatrix(hug, fixed);
    } finally {
      await fixed.context.close();
    }
  } finally {
    await hug.context.close();
  }
}

export async function runSelfCheck(): Promise<void> {
  if (
    parseArtifactPolicy(undefined) !== 'failures' ||
    parseArtifactPolicy('none') !== 'none' ||
    parseArtifactPolicy('all') !== 'all'
  ) {
    throw new Error('Eval artifact policy self-check failed');
  }
  try {
    parseArtifactPolicy('invalid');
    throw new Error('Eval artifact policy accepted an invalid value');
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }
  if (!evalRunIdPattern.test('20260720_self-check') || evalRunIdPattern.test('self-check')) {
    throw new Error('Eval run ID format self-check failed');
  }
  const rotatedConditions = [1, 2, 3, 4].map((trial) => conditionOrderForTrial(trial).join(','));
  if (
    rotatedConditions.join('|') !==
    'pixel-diff,scalar,flat-diff,typed-diff|scalar,flat-diff,typed-diff,pixel-diff|flat-diff,typed-diff,pixel-diff,scalar|typed-diff,pixel-diff,scalar,flat-diff'
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
    const agentRoot = dirname(dirname(context.workspace.agentInput.htmlPath));
    const harnessPaths = [
      context.workspace.implementation.htmlPath,
      ...[...context.workspace.perturbations.values()].map((variant) => variant.htmlPath),
    ];
    if (harnessPaths.some((path) => pathIsWithin(agentRoot, path))) {
      throw new Error('Agent input workspace contains harness-only fixture paths');
    }
    const originalAgentCss = await readFile(context.workspace.agentInput.cssPath, 'utf8');
    if (originalAgentCss !== context.workspace.implementationSource.css) {
      throw new Error('Agent input workspace does not contain the original current CSS');
    }
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
    const rootDiff = initialComparison.styleDiffs.find((styleDiff) => styleDiff.isRoot === true);
    const flatDiffFeedback = buildFlatDiffFeedback(initialComparison, manifest.selector);
    if (
      rootDiff &&
      rootDiff.selector !== manifest.selector &&
      (flatDiffFeedback.text.includes(`"selector": "${rootDiff.selector}"`) ||
        !flatDiffFeedback.text.includes(`"selector": "${manifest.selector}"`))
    ) {
      throw new Error('Flat-diff feedback did not normalize the root selector for repair');
    }
    const typedEvidence = buildTypedDiffEvidence(
      initialComparison,
      manifest.selector,
      context.workspace.implementationSource.css,
      manifest.reference.rootDimensionConstraints
    );
    const typedRootDiff = typedEvidence.styleDiffs.find((styleDiff) => styleDiff.isRoot === true);
    const typedProperties = new Map(
      typedRootDiff?.properties.map((property) => [property.property, property])
    );
    const horizontalSizing = typedEvidence.dimensionConstraints.find(
      (constraint) => constraint.axis === 'horizontal'
    );
    if (
      typedRootDiff?.selector !== manifest.selector ||
      horizontalSizing?.mode !== 'HUG' ||
      horizontalSizing.source !== 'fixture-contract' ||
      horizontalSizing.actionability !== 'diagnostic-only' ||
      horizontalSizing.observedPx !== manifest.reference.expectedMetadata.width ||
      typedProperties.get('padding-left')?.sourceDeclaration !== 'padding' ||
      typedProperties.get('padding-left')?.actionability !== 'repair-candidate' ||
      typedProperties.get('padding-right')?.sourceDeclaration !== 'padding'
    ) {
      throw new Error('Typed-diff feedback did not distinguish authored and derived values');
    }

    const rootProposal: RepairProposal = {
      changes: acceptedRepair,
      diagnosis: 'self-check root repair',
    };
    await context.workspace.applyProposal(rootProposal);
    if ((await readFile(context.workspace.agentInput.cssPath, 'utf8')) !== originalAgentCss) {
      throw new Error('Applying a proposal mutated the agent input workspace');
    }
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
    if (
      !accepted.accepted ||
      !accepted.rootCauseRepaired ||
      accepted.perturbationOutcomes?.length !== manifest.perturbations.length
    ) {
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
  for (const fixtureId of ['atomic-button', 'atomic-button-fixed']) {
    const fixtureManifest = await loadManifestById(fixtureId);
    for (const fixtureMutation of fixtureManifest.mutations) {
      await assertCandidatesTrackTheirMutation(fixtureManifest, fixtureMutation);
    }
  }
  console.log('Eval candidate-provenance self-check passed: every mutation tracks its candidates');
  await runFixedSizingSelfCheck();
  console.log('Eval fixed-sizing self-check passed: atomic-button-fixed');
  await runContractPairSelfCheck();
  console.log('Eval contract-pair self-check passed: atomic-button + atomic-button-fixed');
}
