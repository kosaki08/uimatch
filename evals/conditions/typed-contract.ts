import type { ComparisonSnapshot, ConditionFeedback, RootDimensionConstraint } from '../types.js';
import {
  buildTypedDiffEvidence,
  composeTypedFeedback,
  typedEvidenceGuidance,
  type TypedDiffEvidence,
  type TypedDimensionSignal,
} from './typed-diff.js';

type BehavioralRequirementType =
  | 'preserve-fixed-size'
  | 'preserve-intrinsic-size'
  | 'preserve-parent-fill'
  | 'unknown-sizing';

export interface BehavioralRequirement {
  statement: string;
  type: BehavioralRequirementType;
}

export type ContractDimensionSignal = TypedDimensionSignal & {
  behavioralRequirement: BehavioralRequirement;
};

export interface TypedContractEvidence extends Omit<TypedDiffEvidence, 'dimensionConstraints'> {
  dimensionConstraints: ContractDimensionSignal[];
}

// Stated as an outcome the repair must keep holding, not as a property to set, so that satisfying
// the contract cannot be reduced to copying a value out of the evidence.
export function behavioralRequirementFor(constraint: TypedDimensionSignal): BehavioralRequirement {
  const property = constraint.property;
  const axisNoun = property === 'width' ? 'wide' : 'tall';
  const size = constraint.observedPx === undefined ? undefined : `${constraint.observedPx}px`;
  switch (constraint.mode) {
    case 'FIXED':
      return {
        statement: size
          ? `The repaired element must stay ${size} ${axisNoun} when its content changes. Reaching ${size} for the current content through intrinsic sizing does not satisfy this contract.`
          : `The repaired element must keep the same ${property} when its content changes. Matching the reference for the current content through intrinsic sizing does not satisfy this contract.`,
        type: 'preserve-fixed-size',
      };
    case 'HUG':
      return {
        statement: size
          ? `The repaired element must keep sizing from its own content. Do not freeze the currently observed ${size} into an explicit ${property}.`
          : `The repaired element must keep sizing from its own content. Do not freeze the currently observed size into an explicit ${property}.`,
        type: 'preserve-intrinsic-size',
      };
    case 'FILL':
      return {
        statement: `The repaired element must keep filling the space its parent offers rather than taking an explicit ${property}.`,
        type: 'preserve-parent-fill',
      };
    default:
      return {
        statement: `The sizing behaviour of this axis is unknown, so do not introduce or remove an explicit ${property} to close the difference.`,
        type: 'unknown-sizing',
      };
  }
}

export function buildTypedContractEvidence(
  comparison: ComparisonSnapshot,
  rootSelector: string,
  sourceCss: string,
  dimensionConstraints: readonly RootDimensionConstraint[]
): TypedContractEvidence {
  const evidence = buildTypedDiffEvidence(
    comparison,
    rootSelector,
    sourceCss,
    dimensionConstraints
  );
  return {
    ...evidence,
    dimensionConstraints: evidence.dimensionConstraints.map((constraint) => ({
      ...constraint,
      behavioralRequirement: behavioralRequirementFor(constraint),
    })),
  };
}

export function buildTypedContractFeedback(
  comparison: ComparisonSnapshot,
  rootSelector: string,
  sourceCss: string,
  dimensionConstraints: readonly RootDimensionConstraint[]
): ConditionFeedback {
  const evidence = buildTypedContractEvidence(
    comparison,
    rootSelector,
    sourceCss,
    dimensionConstraints
  );
  return composeTypedFeedback(
    comparison,
    evidence,
    `${typedEvidenceGuidance} Each behavioralRequirement states what must still hold after the repair under content the current rendering does not show; a repair that only reproduces the reference rendering does not satisfy it.`
  );
}
