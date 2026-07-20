import type {
  EvalManifest,
  EvalMutation,
  HiddenAcceptanceResult,
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
    perturbationPasses: ReadonlyMap<string, boolean>;
  }
): HiddenAcceptanceResult {
  const matchedRepairIndex = mutation.rootCause.acceptedRepairs.findIndex((repair) =>
    repair.every((expected) => proposal.changes.some((change) => changesMatch(change, expected)))
  );
  const matchedRepair = mutation.rootCause.acceptedRepairs[matchedRepairIndex];
  const symptomPatchCount = proposal.changes.filter(
    (change) => !matchedRepair?.some((expected) => changesMatch(change, expected))
  ).length;
  const rootCauseRepaired = matchedRepairIndex >= 0;
  const perturbationsSurvived = manifest.perturbations
    .filter((perturbation) => evidence.perturbationPasses.get(perturbation.id) === true)
    .map((perturbation) => perturbation.id);
  const accepted =
    evidence.finalComparisonPassed &&
    perturbationsSurvived.length === manifest.perturbations.length;

  return {
    accepted,
    finalComparisonPassed: evidence.finalComparisonPassed,
    ...(rootCauseRepaired ? { matchedRepairIndex } : {}),
    perturbationsEvaluated: manifest.perturbations.length,
    perturbationsSurvived,
    rootCauseRepaired,
    symptomPatchCount,
  };
}
