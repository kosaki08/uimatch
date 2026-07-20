export const conditionIds = ['pixel-diff', 'scalar', 'flat-diff'] as const;
export const evalIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type ConditionId = (typeof conditionIds)[number];

export function conditionOrderForTrial(trial: number): ConditionId[] {
  if (!Number.isSafeInteger(trial) || trial < 1) {
    throw new RangeError('Eval trial must be a positive safe integer');
  }
  const offset = (trial - 1) % conditionIds.length;
  return [...conditionIds.slice(offset), ...conditionIds.slice(0, offset)];
}

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
  overflowing: boolean;
  padding: [number, number, number, number];
  scrollHeight: number;
  scrollWidth: number;
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
  expectedMetadata: ExpectedMetadata;
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
  schemaVersion: 2;
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
  styleDiffs: Array<{
    isRoot?: boolean;
    properties: Record<string, { actual?: string; expected?: string }>;
    selector: string;
    severity: 'high' | 'low' | 'medium';
  }>;
  visible: VisibleComparisonMetrics;
}

export interface VisibleComparisonMetrics {
  dfs: number;
  highSeverityIssues: number;
  pass: boolean;
  pixelDiffRatio: number;
  pixelDiffRatioContent?: number;
  styleDiffCount: number;
}

export interface HiddenAcceptanceResult {
  accepted: boolean;
  finalComparisonPassed: boolean;
  matchedRepairIndex?: number;
  perturbationsEvaluated: number;
  perturbationsSurvived: string[];
  rootCauseRepaired: boolean;
  unmatchedChangeCount: number;
}

export interface ModelBillingUsage {
  completionTokens: number;
  costUsd: number;
  promptTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
}

export interface ModelTurnUsage extends ModelBillingUsage {
  fallbackUsed?: boolean;
  generationId: string;
  provider?: string;
  responseModel: string;
  routingMetadataError?: string;
}

export interface EvalTurnRecord {
  costUnknown: boolean;
  error?: string;
  finishReason?: string;
  partialUsage?: ModelBillingUsage;
  proposal?: RepairProposal;
  protocolError?: string;
  requestAttempts: number;
  retryDelaysMs: number[];
  turn: number;
  usage?: ModelTurnUsage;
  visibleComparison?: VisibleComparisonMetrics;
}

export type EvalStatus = 'aborted_budget' | 'error' | 'passed' | 'protocol_error' | 'repair_failed';

export interface EvalResult {
  commandBudgetUsd: number;
  condition: ConditionId;
  conditionOrder: ConditionId[];
  costUnknown: boolean;
  finalComparison?: VisibleComparisonMetrics;
  fixtureId: string;
  initialComparison: VisibleComparisonMetrics;
  jobBudgetUsd: number;
  knownCostUsd: number;
  maxTurns: number;
  model: string;
  mutationId: string;
  promptHash: string;
  protocolErrors: number;
  runId: string;
  schemaVersion: 2;
  status: EvalStatus;
  tokensUsed: number;
  trial: number;
  turnRecords: EvalTurnRecord[];
  turns: number;
  uimatchCommit: string;
  acceptance?: HiddenAcceptanceResult;
  error?: string;
}
