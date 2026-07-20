export const conditionIds = ['pixel-diff', 'scalar', 'flat-diff'] as const;
export const evalIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const evalRunIdPattern = /^\d{8}_[A-Za-z0-9][A-Za-z0-9._-]{0,118}$/;

export type ConditionId = (typeof conditionIds)[number];

export const evalArtifactPolicies = ['none', 'failures', 'all'] as const;
export type EvalArtifactPolicy = (typeof evalArtifactPolicies)[number];

export type EvalBackendId = 'codex-exec' | 'openrouter';
export type EvalAuthMode = 'api' | 'subscription';

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

export function expectedMetadataMatches(left: ExpectedMetadata, right: ExpectedMetadata): boolean {
  return (
    left.childCount === right.childCount &&
    left.height === right.height &&
    left.overflowing === right.overflowing &&
    left.scrollHeight === right.scrollHeight &&
    left.scrollWidth === right.scrollWidth &&
    left.width === right.width &&
    left.padding.every((value, index) => value === right.padding[index])
  );
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

export function visibleComparisonMatches(
  left: VisibleComparisonMetrics | undefined,
  right: VisibleComparisonMetrics | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.dfs === right.dfs &&
    left.highSeverityIssues === right.highSeverityIssues &&
    left.pass === right.pass &&
    left.pixelDiffRatio === right.pixelDiffRatio &&
    left.pixelDiffRatioContent === right.pixelDiffRatioContent &&
    left.styleDiffCount === right.styleDiffCount
  );
}

export interface EvalArtifactFile {
  path: string;
  sha256: string;
}

export interface EvalComparisonArtifacts {
  diff: EvalArtifactFile;
  implementation: EvalArtifactFile;
  reference: EvalArtifactFile;
}

export interface EvalPerturbationArtifacts extends EvalComparisonArtifacts {
  passed: boolean;
}

export interface EvalArtifacts {
  final: EvalComparisonArtifacts;
  perturbations?: Record<string, EvalPerturbationArtifacts>;
  policy: Exclude<EvalArtifactPolicy, 'none'>;
  turns?: Record<string, EvalComparisonArtifacts>;
}

export interface HiddenAcceptanceResult {
  accepted: boolean;
  finalComparisonPassed: boolean;
  matchedRepairIndex?: number;
  perturbationOutcomes?: HiddenPerturbationOutcome[];
  perturbationsEvaluated: number;
  perturbationsSurvived: string[];
  rootCauseRepaired: boolean;
  unmatchedChangeCount: number;
}

export interface HiddenPerturbationOutcome {
  actualMetadata: ExpectedMetadata;
  comparison: VisibleComparisonMetrics;
  expectedMetadata: ExpectedMetadata;
  id: string;
  passed: boolean;
}

export interface ModelTokenUsage {
  cachedInputTokens?: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
}

export interface ModelTurnUsage extends ModelTokenUsage {
  authMode: EvalAuthMode;
  backend: EvalBackendId;
  backendVersion: string;
  fallbackUsed?: boolean;
  generationId?: string;
  provider?: string;
  requestedModel: string;
  responseModel?: string;
  routingMetadataError?: string;
}

export type ModelBilling =
  | {
      costUnknown: boolean;
      knownCostUsd: number;
      mode: 'metered-usd';
    }
  | {
      mode: 'subscription';
    };

export type EvalBudget =
  | {
      commandBudgetUsd: number;
      jobBudgetUsd: number;
      mode: 'metered-usd';
    }
  | {
      mode: 'subscription';
    };

export interface EvalTurnRecord {
  billing: ModelBilling;
  error?: string;
  finishReason?: string;
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
  artifacts?: EvalArtifacts;
  authMode: EvalAuthMode;
  backend: EvalBackendId;
  backendVersion: string;
  billing: ModelBilling;
  budget: EvalBudget;
  condition: ConditionId;
  conditionOrder: ConditionId[];
  finalComparison?: VisibleComparisonMetrics;
  fixtureId: string;
  initialComparison: VisibleComparisonMetrics;
  maxTurns: number;
  model: string;
  mutationId: string;
  promptHash: string;
  protocolErrors: number;
  runId: string;
  schemaVersion: 3 | 4;
  status: EvalStatus;
  tokensUsed: number;
  trial: number;
  turnTimeoutMs?: number;
  turnRecords: EvalTurnRecord[];
  turns: number;
  uimatchCommit: string;
  acceptance?: HiddenAcceptanceResult;
  error?: string;
}
