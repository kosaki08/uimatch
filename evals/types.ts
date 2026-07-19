export const conditionIds = ['render-only', 'scalar', 'flat-diff'] as const;

export type ConditionId = (typeof conditionIds)[number];

export interface RepairChange {
  property: string;
  selector: string;
  value: string;
}

export interface RepairProposal {
  changes: RepairChange[];
  diagnosis: string;
}

export interface FixtureVariant {
  css: string;
  html: string;
}

export interface ExpectedMetadata {
  childCount: number;
  height: number;
  padding: [number, number, number, number];
  width: number;
}

export interface RootCause {
  acceptedRepairs: RepairChange[][];
  description: string;
}

export interface EvalMutation extends FixtureVariant {
  id: string;
  rootCause: RootCause;
}

export interface EvalPerturbation extends FixtureVariant {
  id: string;
}

export interface EvalManifest {
  fixtureId: string;
  mutations: EvalMutation[];
  perturbations: EvalPerturbation[];
  reference: FixtureVariant & {
    expectedMetadata: ExpectedMetadata;
    expectedSpec: Record<string, Partial<Record<string, string>>>;
  };
  schemaVersion: 1;
  selector: string;
  viewport: { height: number; width: number };
}

export interface ConditionImage {
  dataUrl: string;
  label: string;
}

export interface ConditionFeedback {
  images: ConditionImage[];
  text: string;
}

export interface ComparisonSnapshot {
  artifacts: {
    diffPngB64: string;
    figmaPngB64: string;
    implPngB64: string;
  };
  metrics: {
    dfs: number;
  };
  styleDiffs: Array<{
    isRoot?: boolean;
    properties: Record<string, { actual?: string; expected?: string }>;
    selector: string;
    severity: 'high' | 'low' | 'medium';
  }>;
}

export interface HiddenAcceptanceResult {
  accepted: boolean;
  matchedRepairIndex?: number;
  perturbationsSurvived: string[];
  rootCauseRepaired: boolean;
  symptomPatchCount: number;
}

export type EvalStatus = 'aborted_budget' | 'error' | 'failed' | 'passed';

export interface EvalResult {
  condition: ConditionId;
  costUsd: number;
  fixtureId: string;
  model: string;
  mutationId: string;
  promptHash: string;
  status: EvalStatus;
  tokensUsed: number;
  turns: number;
  uimatchCommit: string;
  acceptance?: HiddenAcceptanceResult;
  error?: string;
  proposals?: RepairProposal[];
}
