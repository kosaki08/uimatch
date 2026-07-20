export const conditionIds = ['render-only', 'scalar', 'flat-diff'] as const;
export const evalIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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
  editableSelectors: string[];
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
  pass: boolean;
  styleDiffs: Array<{
    isRoot?: boolean;
    properties: Record<string, { actual?: string; expected?: string }>;
    selector: string;
    severity: 'high' | 'low' | 'medium';
  }>;
}

export interface HiddenAcceptanceResult {
  accepted: boolean;
  finalComparisonPassed: boolean;
  matchedRepairIndex?: number;
  perturbationsEvaluated: number;
  perturbationsSurvived: string[];
  rootCauseRepaired: boolean;
  symptomPatchCount: number;
}

export interface ModelTurnUsage {
  completionTokens: number;
  costUsd: number;
  fallbackUsed?: boolean;
  generationId: string;
  promptTokens: number;
  provider?: string;
  reasoningTokens?: number;
  responseModel: string;
  totalTokens: number;
}

export type EvalStatus = 'aborted_budget' | 'error' | 'passed' | 'protocol_error' | 'repair_failed';

export interface EvalResult {
  condition: ConditionId;
  costUsd: number;
  fixtureId: string;
  model: string;
  mutationId: string;
  promptHash: string;
  protocolErrors: number;
  runId: string;
  status: EvalStatus;
  tokensUsed: number;
  trial: number;
  turnUsage: ModelTurnUsage[];
  turns: number;
  uimatchCommit: string;
  acceptance?: HiddenAcceptanceResult;
  error?: string;
  proposals?: RepairProposal[];
}
