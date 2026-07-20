import type {
  EvalManifest,
  EvalMutation,
  HiddenAcceptanceResult,
  HiddenPerturbationOutcome,
  RepairChange,
  RepairProposal,
} from '../types.js';

function changesMatch(left: RepairChange, right: RepairChange): boolean {
  return (
    left.property === right.property &&
    left.selector === right.selector &&
    left.value === right.value
  );
}

export function evaluateHiddenAcceptance(
  manifest: EvalManifest,
  mutation: EvalMutation,
  proposal: RepairProposal,
  evidence: {
    finalComparisonPassed: boolean;
    perturbationOutcomes: HiddenPerturbationOutcome[];
  }
): HiddenAcceptanceResult {
  const expectedPerturbationIds = manifest.perturbations.map((perturbation) => perturbation.id);
  const outcomeIds = evidence.perturbationOutcomes.map((outcome) => outcome.id);
  if (
    outcomeIds.length !== expectedPerturbationIds.length ||
    new Set(outcomeIds).size !== outcomeIds.length ||
    expectedPerturbationIds.some((id) => !outcomeIds.includes(id))
  ) {
    throw new RangeError(
      'Hidden perturbation outcomes must cover every manifest perturbation once'
    );
  }
  const matchedRepairIndex = mutation.rootCause.acceptedRepairs.findIndex((repair) =>
    repair.every((expected) => proposal.changes.some((change) => changesMatch(change, expected)))
  );
  const matchedRepair = mutation.rootCause.acceptedRepairs[matchedRepairIndex];
  const unmatchedChangeCount = proposal.changes.filter(
    (change) => !matchedRepair?.some((expected) => changesMatch(change, expected))
  ).length;
  const rootCauseRepaired = matchedRepairIndex >= 0;
  const outcomesById = new Map(
    evidence.perturbationOutcomes.map((outcome) => [outcome.id, outcome] as const)
  );
  const perturbationsSurvived = manifest.perturbations.flatMap((perturbation) =>
    outcomesById.get(perturbation.id)?.passed === true ? [perturbation.id] : []
  );
  const accepted =
    evidence.finalComparisonPassed &&
    perturbationsSurvived.length === manifest.perturbations.length;

  return {
    accepted,
    finalComparisonPassed: evidence.finalComparisonPassed,
    ...(rootCauseRepaired ? { matchedRepairIndex } : {}),
    perturbationOutcomes: evidence.perturbationOutcomes,
    perturbationsEvaluated: manifest.perturbations.length,
    perturbationsSurvived,
    rootCauseRepaired,
    unmatchedChangeCount,
  };
}
