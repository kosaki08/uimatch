import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { parse } from 'postcss';
import { parseArtifactPolicy } from '../artifacts.js';
import { runCodexExecSelfCheck } from '../backends/codex-exec-self-check.js';
import { runOpenRouterRetrySelfCheck } from '../backends/openrouter.js';
import { buildFlatDiffFeedback } from '../conditions/flat-diff.js';
import { buildPixelDiffFeedback } from '../conditions/pixel-diff.js';
import { buildScalarFeedback } from '../conditions/scalar.js';
import { buildTypedContractEvidence } from '../conditions/typed-contract.js';
import {
  buildTypedDiffEvidence,
  buildTypedDiffFeedback,
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

// Positive control only: the drifted width is authored in the mutation CSS, so every condition can
// repair it without reading the contract. The discriminating case is runHugFixedPairSelfCheck.
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

// Candidates are copies, so nothing keeps them in sync with their mutation. Superset rather than
// equality because the content delta is what the candidate adds.
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

function rootStyleDiffProperties(side: ContractPairSide): Record<string, unknown> {
  return (
    side.initialComparison.styleDiffs.find((styleDiff) => styleDiff.isRoot === true)?.properties ??
    {}
  );
}

function horizontalTypedSignal(side: ContractPairSide): TypedDimensionSignal | undefined {
  return buildTypedDiffEvidence(
    side.initialComparison,
    side.manifest.selector,
    side.context.workspace.implementationSource.css,
    side.manifest.reference.rootDimensionConstraints
  ).dimensionConstraints.find((constraint) => constraint.axis === 'horizontal');
}

function horizontalRequirementType(side: ContractPairSide): string | undefined {
  return buildTypedContractEvidence(
    side.initialComparison,
    side.manifest.selector,
    side.context.workspace.implementationSource.css,
    side.manifest.reference.rootDimensionConstraints
  ).dimensionConstraints.find((entry) => entry.property === 'width')?.behavioralRequirement.type;
}

interface ContractSideExpectation {
  mode: TypedDimensionSignal['mode'];
  requirementType: string;
  side: ContractPairSide;
}

// The two conditions the pair is meant to separate are not equally blind, so the paired trial is
// read against a fixed leakage profile: pixel-diff and scalar see identical payloads; flat-diff
// only names the width on the side whose reference authors it, making it a structured baseline
// rather than a blind one; typed-diff states the sizing mode; typed-contract states the obligation.
function assertConditionsLeakTheContractAsExpected(
  diagnostic: ContractSideExpectation,
  authored: ContractSideExpectation
): void {
  const untypedFeedback = (side: ContractPairSide): string =>
    JSON.stringify([
      buildPixelDiffFeedback(side.initialComparison),
      buildScalarFeedback(side.initialComparison),
    ]);
  if (untypedFeedback(diagnostic.side) !== untypedFeedback(authored.side)) {
    throw new Error('Contract-pair pixel-diff or scalar payloads differ across the pair');
  }

  if ('width' in rootStyleDiffProperties(diagnostic.side)) {
    throw new Error('Contract-pair flat-diff exposed a root width on the diagnostic side');
  }
  const authoredWidthDiff = rootStyleDiffProperties(authored.side).width;
  const authoredWidthValue = authored.side.manifest.reference.expectedMetadata.width;
  if (
    typeof authoredWidthDiff !== 'object' ||
    authoredWidthDiff === null ||
    (authoredWidthDiff as { expected?: unknown }).expected !== `${authoredWidthValue}px`
  ) {
    throw new Error('Contract-pair flat-diff no longer names the width on the authored side');
  }

  for (const expectation of [diagnostic, authored]) {
    const signal = horizontalTypedSignal(expectation.side);
    const expectedActionability = expectation === authored ? 'repair-candidate' : 'diagnostic-only';
    if (signal?.mode !== expectation.mode || signal.actionability !== expectedActionability) {
      throw new Error('Contract-pair typed-diff did not separate the two sizing contracts');
    }
    if (horizontalRequirementType(expectation.side) !== expectation.requirementType) {
      throw new Error('Contract-pair typed-contract did not state the expected requirement');
    }
  }

  if (
    buildTypedDiffFeedback(
      authored.side.initialComparison,
      authored.side.manifest.selector,
      authored.side.context.workspace.implementationSource.css,
      authored.side.manifest.reference.rootDimensionConstraints
    ).text.includes('behavioralRequirement')
  ) {
    throw new Error('Typed-diff leaked a behavioural requirement that belongs to typed-contract');
  }
}

// Asserted on the source, not the render: if the candidate carried the width, hidden acceptance
// could not observe the agent omitting it.
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

interface DiscriminationCase {
  groundTruth: RepairProposal;
  label: string;
  side: ContractPairSide;
}

// The core of every contract pair: each side's ground-truth repair is accepted there, and the same
// proposal is a visible-passing but hidden-rejected overfit on the other side.
async function assertPairDiscriminates(
  first: DiscriminationCase,
  second: DiscriminationCase
): Promise<void> {
  for (const [correct, overfit] of [
    [first, second],
    [second, first],
  ] as const) {
    const onCorrect = await evaluateContractPairRepair(correct.side, correct.groundTruth);
    if (!onCorrect.accepted || !onCorrect.rootCauseRepaired) {
      throw new Error(`Contract-pair ${correct.label} side rejected its ground-truth repair`);
    }
    const onOverfit = await evaluateContractPairRepair(overfit.side, correct.groundTruth);
    if (!onOverfit.finalComparisonPassed || onOverfit.accepted) {
      throw new Error(`Contract-pair ${overfit.label} side accepted the ${correct.label} repair`);
    }
  }
}

function repairProposal(selector: string, property: string, value: string): RepairProposal {
  return { changes: [{ property, selector, value }], diagnosis: `contract-pair ${value}` };
}

// Counterfactual pair: both sides render identically from byte-identical mutated sources, so the
// same proposal must be correct on one side and an overfit on the other. Padding alone is right
// under HUG; padding plus an explicit width is right under FIXED.
async function runHugFixedPairSelfCheck(): Promise<void> {
  const hug = await openContractPairSide('atomic-button', 'padding-drift');
  try {
    const fixed = await openContractPairSide(
      'atomic-button-fixed',
      'padding-drift-missing-fixed-width'
    );
    try {
      const selector = hug.manifest.selector;
      assertPairInputsAreIdentical(hug, fixed);
      assertConditionsLeakTheContractAsExpected(
        { mode: 'HUG', requirementType: 'preserve-intrinsic-size', side: hug },
        { mode: 'FIXED', requirementType: 'preserve-fixed-size', side: fixed }
      );
      await assertFixedCandidatesOmitTheWidth(fixed);
      await assertPairDiscriminates(
        { groundTruth: repairProposal(selector, 'padding', '8px 16px'), label: 'HUG', side: hug },
        {
          groundTruth: {
            changes: [
              { property: 'padding', selector, value: '8px 16px' },
              { property: 'width', selector, value: '96px' },
            ],
            diagnosis: 'contract-pair padding and width',
          },
          label: 'FIXED',
          side: fixed,
        }
      );
    } finally {
      await fixed.context.close();
    }
  } finally {
    await hug.context.close();
  }
}

// Second counterfactual pair, on a relational contract: the correct width cannot be read off the
// current rendering because it depends on the parent. Filling is right under FILL; pinning the
// explicit width is right under FIXED.
async function runFillFixedPairSelfCheck(): Promise<void> {
  const fill = await openContractPairSide('fill-width', 'parent-relative-drift');
  try {
    const fixed = await openContractPairSide('fixed-width', 'parent-relative-drift');
    try {
      const selector = fill.manifest.selector;
      assertPairInputsAreIdentical(fill, fixed);
      assertConditionsLeakTheContractAsExpected(
        { mode: 'FILL', requirementType: 'preserve-parent-fill', side: fill },
        { mode: 'FIXED', requirementType: 'preserve-fixed-size', side: fixed }
      );
      await assertPairDiscriminates(
        { groundTruth: repairProposal(selector, 'width', '100%'), label: 'FILL', side: fill },
        { groundTruth: repairProposal(selector, 'width', '240px'), label: 'FIXED', side: fixed }
      );
    } finally {
      await fixed.context.close();
    }
  } finally {
    await fill.context.close();
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
  const rotatedConditions = [1, 2, 3, 4, 5].map((trial) => conditionOrderForTrial(trial).join(','));
  if (
    rotatedConditions.join('|') !==
    'pixel-diff,scalar,flat-diff,typed-diff,typed-contract|scalar,flat-diff,typed-diff,typed-contract,pixel-diff|flat-diff,typed-diff,typed-contract,pixel-diff,scalar|typed-diff,typed-contract,pixel-diff,scalar,flat-diff|typed-contract,pixel-diff,scalar,flat-diff,typed-diff'
  ) {
    throw new Error('Eval condition rotation self-check failed');
  }
  const subsetRotation = [1, 2, 3].map((trial) =>
    conditionOrderForTrial(trial, ['flat-diff', 'typed-diff', 'typed-contract']).join(',')
  );
  if (
    subsetRotation.join('|') !==
    'flat-diff,typed-diff,typed-contract|typed-diff,typed-contract,flat-diff|typed-contract,flat-diff,typed-diff'
  ) {
    throw new Error('Eval condition subset rotation self-check failed');
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
  for (const fixtureId of ['atomic-button', 'atomic-button-fixed', 'fill-width', 'fixed-width']) {
    const fixtureManifest = await loadManifestById(fixtureId);
    for (const fixtureMutation of fixtureManifest.mutations) {
      await assertCandidatesTrackTheirMutation(fixtureManifest, fixtureMutation);
    }
  }
  console.log('Eval candidate-provenance self-check passed: every mutation tracks its candidates');
  await runFixedSizingSelfCheck();
  console.log('Eval fixed-sizing self-check passed: atomic-button-fixed');
  await runHugFixedPairSelfCheck();
  console.log('Eval contract-pair self-check passed: atomic-button + atomic-button-fixed');
  await runFillFixedPairSelfCheck();
  console.log('Eval contract-pair self-check passed: fill-width + fixed-width');
}
