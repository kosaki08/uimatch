import { readdir, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evalRoot } from '../manifest.js';
import { parseRepairProposal } from '../repair-proposal.js';
import {
  conditionIds,
  conditionOrderForTrial,
  evalRunIdPattern,
  expectedMetadataMatches,
  visibleComparisonMatches,
  type ConditionId,
  type EvalArtifactFile,
  type EvalArtifacts,
  type EvalAuthMode,
  type EvalBackendId,
  type EvalBudget,
  type EvalResult,
  type EvalStatus,
  type EvalTurnRecord,
  type ExpectedMetadata,
  type HiddenAcceptanceResult,
  type HiddenPerturbationOutcome,
  type ModelBilling,
  type ModelTokenUsage,
  type ModelTurnUsage,
  type VisibleComparisonMetrics,
} from '../types.js';

class ReportUsageError extends Error {}

export interface StoredEvalResult {
  path: string;
  raw: Record<string, unknown>;
  result: EvalResult;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : asString(value, label);
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function asNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
  return value;
}

function asPositiveNumber(value: unknown, label: string): number {
  const parsed = asNonNegativeNumber(value, label);
  if (parsed === 0) throw new TypeError(`${label} must be positive`);
  return parsed;
}

function asNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function asPositiveInteger(value: unknown, label: string): number {
  const parsed = asNonNegativeInteger(value, label);
  if (parsed === 0) throw new TypeError(`${label} must be positive`);
  return parsed;
}

function asBackend(value: unknown, label: string): EvalBackendId {
  if (value !== 'codex-exec' && value !== 'openrouter') {
    throw new TypeError(`${label} must be a known eval backend`);
  }
  return value;
}

function asAuthMode(value: unknown, label: string): EvalAuthMode {
  if (value !== 'api' && value !== 'subscription') {
    throw new TypeError(`${label} must be a known auth mode`);
  }
  return value;
}

function asCondition(value: unknown, label: string): ConditionId {
  if (!conditionIds.some((condition) => condition === value)) {
    throw new TypeError(`${label} must be a known eval condition`);
  }
  return value as ConditionId;
}

function asConditionOrder(value: unknown, label: string): ConditionId[] {
  if (!Array.isArray(value) || value.length !== conditionIds.length) {
    throw new TypeError(`${label} must contain every eval condition once`);
  }
  const parsed = value.map((entry, index) => asCondition(entry, `${label}[${index}]`));
  if (new Set(parsed).size !== conditionIds.length) {
    throw new TypeError(`${label} must contain every eval condition once`);
  }
  return parsed;
}

function asStatus(value: unknown, label: string): EvalStatus {
  const statuses: EvalStatus[] = [
    'aborted_budget',
    'error',
    'passed',
    'protocol_error',
    'repair_failed',
  ];
  if (!statuses.some((status) => status === value)) {
    throw new TypeError(`${label} must be a known eval status`);
  }
  return value as EvalStatus;
}

function parseVisibleComparison(value: unknown, label: string): VisibleComparisonMetrics {
  const record = asRecord(value, label);
  const pixelDiffRatioContent =
    record.pixelDiffRatioContent === undefined
      ? undefined
      : asNonNegativeNumber(record.pixelDiffRatioContent, `${label}.pixelDiffRatioContent`);
  return {
    dfs: asNonNegativeNumber(record.dfs, `${label}.dfs`),
    highSeverityIssues: asNonNegativeInteger(
      record.highSeverityIssues,
      `${label}.highSeverityIssues`
    ),
    pass: asBoolean(record.pass, `${label}.pass`),
    pixelDiffRatio: asNonNegativeNumber(record.pixelDiffRatio, `${label}.pixelDiffRatio`),
    ...(pixelDiffRatioContent === undefined ? {} : { pixelDiffRatioContent }),
    styleDiffCount: asNonNegativeInteger(record.styleDiffCount, `${label}.styleDiffCount`),
  };
}

function parseExpectedMetadata(value: unknown, label: string): ExpectedMetadata {
  const record = asRecord(value, label);
  if (!Array.isArray(record.padding) || record.padding.length !== 4) {
    throw new TypeError(`${label}.padding must contain four values`);
  }
  return {
    childCount: asNonNegativeInteger(record.childCount, `${label}.childCount`),
    height: asNonNegativeNumber(record.height, `${label}.height`),
    overflowing: asBoolean(record.overflowing, `${label}.overflowing`),
    padding: [
      asNonNegativeNumber(record.padding[0], `${label}.padding[0]`),
      asNonNegativeNumber(record.padding[1], `${label}.padding[1]`),
      asNonNegativeNumber(record.padding[2], `${label}.padding[2]`),
      asNonNegativeNumber(record.padding[3], `${label}.padding[3]`),
    ],
    scrollHeight: asNonNegativeNumber(record.scrollHeight, `${label}.scrollHeight`),
    scrollWidth: asNonNegativeNumber(record.scrollWidth, `${label}.scrollWidth`),
    width: asNonNegativeNumber(record.width, `${label}.width`),
  };
}

function parsePerturbationOutcome(value: unknown, label: string): HiddenPerturbationOutcome {
  const record = asRecord(value, label);
  const actualMetadata = parseExpectedMetadata(record.actualMetadata, `${label}.actualMetadata`);
  const comparison = parseVisibleComparison(record.comparison, `${label}.comparison`);
  const expectedMetadata = parseExpectedMetadata(
    record.expectedMetadata,
    `${label}.expectedMetadata`
  );
  const passed = asBoolean(record.passed, `${label}.passed`);
  if (passed !== (comparison.pass && expectedMetadataMatches(actualMetadata, expectedMetadata))) {
    throw new TypeError(`${label}.passed does not match comparison and metadata`);
  }
  return {
    actualMetadata,
    comparison,
    expectedMetadata,
    id: asString(record.id, `${label}.id`),
    passed,
  };
}

function parseArtifactFile(
  value: unknown,
  label: string,
  expectedPrefix: string
): EvalArtifactFile {
  const record = asRecord(value, label);
  const path = asString(record.path, `${label}.path`);
  const sha256 = asString(record.sha256, `${label}.sha256`);
  if (!path.startsWith(expectedPrefix) || path.includes('\\') || path.split('/').includes('..')) {
    throw new TypeError(`${label}.path must stay inside the result artifact directory`);
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new TypeError(`${label}.sha256 must be a lowercase SHA-256 digest`);
  }
  return { path, sha256 };
}

function parseComparisonArtifacts(
  value: unknown,
  label: string,
  expectedPrefix: string
): EvalArtifacts['final'] {
  const record = asRecord(value, label);
  return {
    diff: parseArtifactFile(record.diff, `${label}.diff`, expectedPrefix),
    implementation: parseArtifactFile(
      record.implementation,
      `${label}.implementation`,
      expectedPrefix
    ),
    reference: parseArtifactFile(record.reference, `${label}.reference`, expectedPrefix),
  };
}

function parseArtifacts(
  value: unknown,
  label: string,
  identity: {
    condition: ConditionId;
    fixtureId: string;
    mutationId: string;
    runId: string;
    trial: number;
  }
): EvalArtifacts {
  const record = asRecord(value, label);
  if (record.policy !== 'failures' && record.policy !== 'all') {
    throw new TypeError(`${label}.policy must be failures or all`);
  }
  const expectedPrefix = `artifacts/${identity.runId}/${identity.fixtureId}/${identity.mutationId}/${identity.condition}/trial-${identity.trial}/`;
  const perturbationRecord =
    record.perturbations === undefined
      ? undefined
      : asRecord(record.perturbations, `${label}.perturbations`);
  const perturbations = perturbationRecord
    ? Object.fromEntries(
        Object.entries(perturbationRecord).map(([id, entry]) => {
          const perturbation = asRecord(entry, `${label}.perturbations.${id}`);
          const passed = asBoolean(perturbation.passed, `${label}.perturbations.${id}.passed`);
          if (record.policy === 'failures' && passed) {
            throw new TypeError(`${label}.perturbations.${id} must be a failed perturbation`);
          }
          return [
            id,
            {
              ...parseComparisonArtifacts(
                perturbation,
                `${label}.perturbations.${id}`,
                expectedPrefix
              ),
              passed,
            },
          ];
        })
      )
    : undefined;
  const turnRecord =
    record.turns === undefined ? undefined : asRecord(record.turns, `${label}.turns`);
  if (record.policy === 'failures' && turnRecord !== undefined) {
    throw new TypeError(`${label}.turns requires the all artifact policy`);
  }
  const turns = turnRecord
    ? Object.fromEntries(
        Object.entries(turnRecord).map(([turn, entry]) => {
          if (!/^[1-9]\d*$/.test(turn)) {
            throw new TypeError(`${label}.turns keys must be positive integers`);
          }
          return [turn, parseComparisonArtifacts(entry, `${label}.turns.${turn}`, expectedPrefix)];
        })
      )
    : undefined;
  return {
    final: parseComparisonArtifacts(record.final, `${label}.final`, expectedPrefix),
    ...(perturbations === undefined ? {} : { perturbations }),
    policy: record.policy,
    ...(turns === undefined ? {} : { turns }),
  };
}

function parseTokenUsage(value: unknown, label: string): ModelTokenUsage {
  const record = asRecord(value, label);
  const inputTokens = asNonNegativeInteger(record.inputTokens, `${label}.inputTokens`);
  const outputTokens = asNonNegativeInteger(record.outputTokens, `${label}.outputTokens`);
  const totalTokens = asNonNegativeInteger(record.totalTokens, `${label}.totalTokens`);
  if (inputTokens + outputTokens !== totalTokens) {
    throw new TypeError(`${label} token totals are inconsistent`);
  }
  const cachedInputTokens =
    record.cachedInputTokens === undefined
      ? undefined
      : asNonNegativeInteger(record.cachedInputTokens, `${label}.cachedInputTokens`);
  if (cachedInputTokens !== undefined && cachedInputTokens > inputTokens) {
    throw new TypeError(`${label}.cachedInputTokens must not exceed inputTokens`);
  }
  return {
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    inputTokens,
    outputTokens,
    ...(record.reasoningTokens === undefined
      ? {}
      : {
          reasoningTokens: asNonNegativeInteger(record.reasoningTokens, `${label}.reasoningTokens`),
        }),
    totalTokens,
  };
}

function parseTurnUsage(value: unknown, label: string): ModelTurnUsage {
  const record = asRecord(value, label);
  const tokens = parseTokenUsage(record, label);
  const generationId = asOptionalString(record.generationId, `${label}.generationId`);
  const provider = asOptionalString(record.provider, `${label}.provider`);
  const responseModel = asOptionalString(record.responseModel, `${label}.responseModel`);
  const routingMetadataError = asOptionalString(
    record.routingMetadataError,
    `${label}.routingMetadataError`
  );
  return {
    ...tokens,
    authMode: asAuthMode(record.authMode, `${label}.authMode`),
    backend: asBackend(record.backend, `${label}.backend`),
    backendVersion: asString(record.backendVersion, `${label}.backendVersion`),
    ...(record.fallbackUsed === undefined
      ? {}
      : { fallbackUsed: asBoolean(record.fallbackUsed, `${label}.fallbackUsed`) }),
    ...(generationId ? { generationId } : {}),
    ...(provider ? { provider } : {}),
    requestedModel: asString(record.requestedModel, `${label}.requestedModel`),
    ...(responseModel ? { responseModel } : {}),
    ...(routingMetadataError ? { routingMetadataError } : {}),
  };
}

function parseBilling(value: unknown, label: string): ModelBilling {
  const record = asRecord(value, label);
  if (record.mode === 'subscription') return { mode: 'subscription' };
  if (record.mode !== 'metered-usd') {
    throw new TypeError(`${label}.mode must be metered-usd or subscription`);
  }
  return {
    costUnknown: asBoolean(record.costUnknown, `${label}.costUnknown`),
    knownCostUsd: asNonNegativeNumber(record.knownCostUsd, `${label}.knownCostUsd`),
    mode: 'metered-usd',
  };
}

function parseBudget(value: unknown, label: string): EvalBudget {
  const record = asRecord(value, label);
  if (record.mode === 'subscription') return { mode: 'subscription' };
  if (record.mode !== 'metered-usd') {
    throw new TypeError(`${label}.mode must be metered-usd or subscription`);
  }
  return {
    commandBudgetUsd: asPositiveNumber(record.commandBudgetUsd, `${label}.commandBudgetUsd`),
    jobBudgetUsd: asPositiveNumber(record.jobBudgetUsd, `${label}.jobBudgetUsd`),
    mode: 'metered-usd',
  };
}

function parseTurnRecord(value: unknown, label: string): EvalTurnRecord {
  const record = asRecord(value, label);
  if (!Array.isArray(record.retryDelaysMs)) {
    throw new TypeError(`${label}.retryDelaysMs must be an array`);
  }
  const requestAttempts = asPositiveInteger(record.requestAttempts, `${label}.requestAttempts`);
  const retryDelaysMs = record.retryDelaysMs.map((delay, index) =>
    asNonNegativeInteger(delay, `${label}.retryDelaysMs[${index}]`)
  );
  if (retryDelaysMs.length !== requestAttempts - 1) {
    throw new TypeError(`${label}.retryDelaysMs must describe every retry`);
  }
  const billing = parseBilling(record.billing, `${label}.billing`);
  const finishReason = asOptionalString(record.finishReason, `${label}.finishReason`);
  const error = asOptionalString(record.error, `${label}.error`);
  const usage =
    record.usage === undefined ? undefined : parseTurnUsage(record.usage, `${label}.usage`);
  if (finishReason !== undefined && usage === undefined) {
    throw new TypeError(`${label}.finishReason requires usage`);
  }
  if (finishReason === undefined && error === undefined) {
    throw new TypeError(`${label}.error is required when no completed response was returned`);
  }
  if (billing.mode === 'metered-usd' && !billing.costUnknown && usage === undefined) {
    throw new TypeError(`${label}.usage is required when metered billing is known`);
  }
  return {
    billing,
    ...(error ? { error } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(record.proposal === undefined
      ? {}
      : { proposal: parseRepairProposal(record.proposal, `${label}.proposal`) }),
    ...(record.protocolError === undefined
      ? {}
      : { protocolError: asString(record.protocolError, `${label}.protocolError`) }),
    requestAttempts,
    retryDelaysMs,
    turn: asPositiveInteger(record.turn, `${label}.turn`),
    ...(usage ? { usage } : {}),
    ...(record.visibleComparison === undefined
      ? {}
      : {
          visibleComparison: parseVisibleComparison(
            record.visibleComparison,
            `${label}.visibleComparison`
          ),
        }),
  };
}

function parseAcceptance(
  value: unknown,
  label: string,
  requirePerturbationOutcomes: boolean
): HiddenAcceptanceResult {
  const record = asRecord(value, label);
  if (!Array.isArray(record.perturbationsSurvived)) {
    throw new TypeError(`${label}.perturbationsSurvived must be an array`);
  }
  const matchedRepairIndex =
    record.matchedRepairIndex === undefined
      ? undefined
      : asNonNegativeInteger(record.matchedRepairIndex, `${label}.matchedRepairIndex`);
  const perturbationsEvaluated = asNonNegativeInteger(
    record.perturbationsEvaluated,
    `${label}.perturbationsEvaluated`
  );
  const perturbationsSurvived = record.perturbationsSurvived.map((entry, index) =>
    asString(entry, `${label}.perturbationsSurvived[${index}]`)
  );
  if (
    perturbationsSurvived.length > perturbationsEvaluated ||
    new Set(perturbationsSurvived).size !== perturbationsSurvived.length
  ) {
    throw new TypeError(`${label}.perturbationsSurvived is inconsistent`);
  }
  const perturbationOutcomes =
    record.perturbationOutcomes === undefined
      ? undefined
      : (() => {
          if (!Array.isArray(record.perturbationOutcomes)) {
            throw new TypeError(`${label}.perturbationOutcomes must be an array`);
          }
          return record.perturbationOutcomes.map((entry, index) =>
            parsePerturbationOutcome(entry, `${label}.perturbationOutcomes[${index}]`)
          );
        })();
  if (requirePerturbationOutcomes && perturbationOutcomes === undefined) {
    throw new TypeError(`${label}.perturbationOutcomes is required for schema version 4`);
  }
  if (perturbationOutcomes) {
    const outcomeIds = perturbationOutcomes.map((outcome) => outcome.id);
    const survivedIds = perturbationOutcomes
      .filter((outcome) => outcome.passed)
      .map((outcome) => outcome.id);
    if (
      perturbationOutcomes.length !== perturbationsEvaluated ||
      new Set(outcomeIds).size !== outcomeIds.length ||
      survivedIds.length !== perturbationsSurvived.length ||
      survivedIds.some((id) => !perturbationsSurvived.includes(id))
    ) {
      throw new TypeError(`${label}.perturbationOutcomes is inconsistent`);
    }
  }
  return {
    accepted: asBoolean(record.accepted, `${label}.accepted`),
    finalComparisonPassed: asBoolean(
      record.finalComparisonPassed,
      `${label}.finalComparisonPassed`
    ),
    ...(matchedRepairIndex === undefined ? {} : { matchedRepairIndex }),
    ...(perturbationOutcomes === undefined ? {} : { perturbationOutcomes }),
    perturbationsEvaluated,
    perturbationsSurvived,
    rootCauseRepaired: asBoolean(record.rootCauseRepaired, `${label}.rootCauseRepaired`),
    unmatchedChangeCount: asNonNegativeInteger(
      record.unmatchedChangeCount,
      `${label}.unmatchedChangeCount`
    ),
  };
}

function sameBilling(left: ModelBilling, right: ModelBilling): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === 'subscription' || right.mode === 'subscription') return true;
  return (
    left.costUnknown === right.costUnknown &&
    Math.abs(left.knownCostUsd - right.knownCostUsd) <= 1e-9
  );
}

function aggregateTurnBilling(
  turnRecords: EvalTurnRecord[],
  mode: ModelBilling['mode']
): ModelBilling {
  if (mode === 'subscription') {
    if (turnRecords.some((turnRecord) => turnRecord.billing.mode !== 'subscription')) {
      throw new TypeError('Turn billing modes are inconsistent');
    }
    return { mode: 'subscription' };
  }
  if (turnRecords.some((turnRecord) => turnRecord.billing.mode !== 'metered-usd')) {
    throw new TypeError('Turn billing modes are inconsistent');
  }
  return {
    costUnknown: turnRecords.some(
      (turnRecord) => turnRecord.billing.mode === 'metered-usd' && turnRecord.billing.costUnknown
    ),
    knownCostUsd: turnRecords.reduce(
      (sum, turnRecord) =>
        sum + (turnRecord.billing.mode === 'metered-usd' ? turnRecord.billing.knownCostUsd : 0),
      0
    ),
    mode: 'metered-usd',
  };
}

export function parseEvalResult(value: unknown, file: string): EvalResult {
  const record = asRecord(value, file);
  if (record.schemaVersion !== 3 && record.schemaVersion !== 4) {
    throw new TypeError(`${file}.schemaVersion must be 3 or 4`);
  }
  const schemaVersion = record.schemaVersion;
  if (!Array.isArray(record.turnRecords)) {
    throw new TypeError(`${file}.turnRecords must be an array`);
  }
  const turnRecords = record.turnRecords.map((entry, index) =>
    parseTurnRecord(entry, `${file}.turnRecords[${index}]`)
  );
  turnRecords.forEach((turnRecord, index) => {
    if (turnRecord.turn !== index + 1) {
      throw new TypeError(`${file}.turnRecords must use consecutive turn numbers`);
    }
  });
  const turns = asNonNegativeInteger(record.turns, `${file}.turns`);
  if (turns !== turnRecords.length) throw new TypeError(`${file}.turns does not match turnRecords`);

  const backend = asBackend(record.backend, `${file}.backend`);
  const authMode = asAuthMode(record.authMode, `${file}.authMode`);
  const backendVersion = asString(record.backendVersion, `${file}.backendVersion`);
  const model = asString(record.model, `${file}.model`);
  const billing = parseBilling(record.billing, `${file}.billing`);
  const budget = parseBudget(record.budget, `${file}.budget`);
  if (billing.mode !== budget.mode) throw new TypeError(`${file} billing and budget modes differ`);
  if (
    (backend === 'openrouter' && (authMode !== 'api' || billing.mode !== 'metered-usd')) ||
    (backend === 'codex-exec' && (authMode !== 'subscription' || billing.mode !== 'subscription'))
  ) {
    throw new TypeError(`${file} backend, auth, and billing modes are inconsistent`);
  }
  const derivedBilling = aggregateTurnBilling(turnRecords, billing.mode);
  if (!sameBilling(billing, derivedBilling)) {
    throw new TypeError(`${file}.billing does not match turnRecords`);
  }
  for (const turnRecord of turnRecords) {
    if (
      turnRecord.usage &&
      (turnRecord.usage.backend !== backend ||
        turnRecord.usage.authMode !== authMode ||
        turnRecord.usage.backendVersion !== backendVersion ||
        turnRecord.usage.requestedModel !== model)
    ) {
      throw new TypeError(`${file}.turnRecords contain inconsistent backend metadata`);
    }
  }
  const tokensUsed = asNonNegativeInteger(record.tokensUsed, `${file}.tokensUsed`);
  if (
    turnRecords.reduce((sum, turnRecord) => sum + (turnRecord.usage?.totalTokens ?? 0), 0) !==
    tokensUsed
  ) {
    throw new TypeError(`${file}.tokensUsed does not match turnRecords`);
  }
  const protocolErrors = asNonNegativeInteger(record.protocolErrors, `${file}.protocolErrors`);
  if (
    protocolErrors !==
    turnRecords.filter((turnRecord) => turnRecord.protocolError !== undefined).length
  ) {
    throw new TypeError(`${file}.protocolErrors does not match turnRecords`);
  }
  const finalComparison =
    record.finalComparison === undefined
      ? undefined
      : parseVisibleComparison(record.finalComparison, `${file}.finalComparison`);
  const derivedFinalComparison = [...turnRecords]
    .reverse()
    .find((turnRecord) => turnRecord.visibleComparison !== undefined)?.visibleComparison;
  if (!visibleComparisonMatches(finalComparison, derivedFinalComparison)) {
    throw new TypeError(`${file}.finalComparison does not match turnRecords`);
  }
  const initialComparison = parseVisibleComparison(
    record.initialComparison,
    `${file}.initialComparison`
  );
  if (initialComparison.pass) {
    throw new TypeError(`${file}.initialComparison must describe a failing mutation`);
  }
  const trial = asPositiveInteger(record.trial, `${file}.trial`);
  const conditionOrder = asConditionOrder(record.conditionOrder, `${file}.conditionOrder`);
  const expectedConditionOrder = conditionOrderForTrial(trial);
  if (!conditionOrder.every((condition, index) => condition === expectedConditionOrder[index])) {
    throw new TypeError(`${file}.conditionOrder does not match trial ${trial}`);
  }
  const status = asStatus(record.status, `${file}.status`);
  const acceptance =
    record.acceptance === undefined
      ? undefined
      : parseAcceptance(record.acceptance, `${file}.acceptance`, schemaVersion === 4);
  if (acceptance && acceptance.finalComparisonPassed !== finalComparison?.pass) {
    throw new TypeError(`${file}.acceptance does not match finalComparison`);
  }
  if ((status === 'passed') !== (acceptance?.accepted === true)) {
    throw new TypeError(`${file}.passed status does not match acceptance`);
  }
  if ((status === 'passed' || status === 'repair_failed') !== (acceptance !== undefined)) {
    throw new TypeError(`${file}.acceptance must exist exactly for evaluated repairs`);
  }
  const error = asOptionalString(record.error, `${file}.error`);
  if ((status === 'error') !== (error !== undefined)) {
    throw new TypeError(`${file}.error must exist exactly when status is error`);
  }
  if (billing.mode === 'metered-usd' && billing.costUnknown && status !== 'error') {
    throw new TypeError(`${file}.billing.costUnknown requires error status`);
  }
  if (status === 'aborted_budget' && budget.mode !== 'metered-usd') {
    throw new TypeError(`${file}.aborted_budget requires metered billing`);
  }
  const turnTimeoutMs =
    record.turnTimeoutMs === undefined
      ? undefined
      : asPositiveInteger(record.turnTimeoutMs, `${file}.turnTimeoutMs`);
  if (schemaVersion === 4 && backend === 'codex-exec' && turnTimeoutMs === undefined) {
    throw new TypeError(`${file}.turnTimeoutMs is required for Codex schema version 4 results`);
  }
  if (backend !== 'codex-exec' && turnTimeoutMs !== undefined) {
    throw new TypeError(`${file}.turnTimeoutMs is only valid for Codex results`);
  }
  const condition = asCondition(record.condition, `${file}.condition`);
  const fixtureId = asString(record.fixtureId, `${file}.fixtureId`);
  const mutationId = asString(record.mutationId, `${file}.mutationId`);
  const runId = asString(record.runId, `${file}.runId`);
  const artifacts =
    record.artifacts === undefined
      ? undefined
      : parseArtifacts(record.artifacts, `${file}.artifacts`, {
          condition,
          fixtureId,
          mutationId,
          runId,
          trial,
        });
  if (artifacts) {
    if (!finalComparison) {
      throw new TypeError(`${file}.artifacts requires a recorded final comparison`);
    }
    const perturbationOutcomes = acceptance?.perturbationOutcomes ?? [];
    const expectedPerturbationIds = perturbationOutcomes
      .filter((outcome) => artifacts.policy === 'all' || !outcome.passed)
      .map((outcome) => outcome.id)
      .sort();
    const artifactPerturbationIds = Object.keys(artifacts.perturbations ?? {}).sort();
    if (expectedPerturbationIds.join('\0') !== artifactPerturbationIds.join('\0')) {
      throw new TypeError(`${file}.artifacts.perturbations does not match its policy`);
    }
    for (const [id, artifact] of Object.entries(artifacts.perturbations ?? {})) {
      if (perturbationOutcomes.find((outcome) => outcome.id === id)?.passed !== artifact.passed) {
        throw new TypeError(`${file}.artifacts.perturbations.${id}.passed is inconsistent`);
      }
    }
    const expectedTurns =
      artifacts.policy === 'all'
        ? turnRecords
            .filter(
              (turnRecord) =>
                turnRecord.proposal !== undefined && turnRecord.visibleComparison !== undefined
            )
            .map((turnRecord) => String(turnRecord.turn))
        : [];
    if (expectedTurns.join('\0') !== Object.keys(artifacts.turns ?? {}).join('\0')) {
      throw new TypeError(`${file}.artifacts.turns does not match its policy`);
    }
  }
  return {
    ...(acceptance ? { acceptance } : {}),
    ...(artifacts ? { artifacts } : {}),
    authMode,
    backend,
    backendVersion,
    billing,
    budget,
    condition,
    conditionOrder,
    ...(error ? { error } : {}),
    ...(finalComparison ? { finalComparison } : {}),
    fixtureId,
    initialComparison,
    maxTurns: asPositiveInteger(record.maxTurns, `${file}.maxTurns`),
    model,
    mutationId,
    promptHash: asString(record.promptHash, `${file}.promptHash`),
    protocolErrors,
    runId,
    schemaVersion,
    status,
    tokensUsed,
    trial,
    ...(turnTimeoutMs === undefined ? {} : { turnTimeoutMs }),
    turnRecords,
    turns,
    uimatchCommit: asString(record.uimatchCommit, `${file}.uimatchCommit`),
  };
}

export function runReportContractSelfCheck(): void {
  const initialComparison: VisibleComparisonMetrics = {
    dfs: 50,
    highSeverityIssues: 1,
    pass: false,
    pixelDiffRatio: 0.1,
    styleDiffCount: 1,
  };
  const common = {
    condition: 'pixel-diff' as const,
    conditionOrder: conditionOrderForTrial(1),
    fixtureId: 'self-check-fixture',
    initialComparison,
    maxTurns: 1,
    model: 'self-check-model',
    mutationId: 'self-check-mutation',
    promptHash: 'self-check-prompt',
    protocolErrors: 0,
    runId: '20260720_self-check-run',
    schemaVersion: 4 as const,
    tokensUsed: 0,
    trial: 1,
    turns: 1,
    uimatchCommit: 'self-check-commit',
  };
  const subscription = parseEvalResult(
    {
      ...common,
      authMode: 'subscription',
      backend: 'codex-exec',
      backendVersion: 'self-check',
      billing: { mode: 'subscription' },
      budget: { mode: 'subscription' },
      error: 'self-check error',
      status: 'error',
      turnTimeoutMs: 120_000,
      turnRecords: [
        {
          billing: { mode: 'subscription' },
          error: 'self-check error',
          requestAttempts: 1,
          retryDelaysMs: [],
          turn: 1,
        },
      ],
    },
    'subscription self-check'
  );
  if (subscription.billing.mode !== 'subscription') {
    throw new Error('Subscription result contract self-check failed');
  }

  const passingComparison: VisibleComparisonMetrics = {
    dfs: 100,
    highSeverityIssues: 0,
    pass: true,
    pixelDiffRatio: 0,
    styleDiffCount: 0,
  };
  const expectedMetadata: ExpectedMetadata = {
    childCount: 1,
    height: 40,
    overflowing: false,
    padding: [8, 16, 8, 16],
    scrollHeight: 40,
    scrollWidth: 96,
    width: 96,
  };
  const artifactFile = (name: string) => ({
    path: `artifacts/${common.runId}/${common.fixtureId}/${common.mutationId}/${common.condition}/trial-${common.trial}/${name}.png`,
    sha256: 'a'.repeat(64),
  });
  const passedRaw = {
    ...common,
    acceptance: {
      accepted: true,
      finalComparisonPassed: true,
      matchedRepairIndex: 0,
      perturbationOutcomes: [
        {
          actualMetadata: expectedMetadata,
          comparison: passingComparison,
          expectedMetadata,
          id: 'self-check-perturbation',
          passed: true,
        },
      ],
      perturbationsEvaluated: 1,
      perturbationsSurvived: ['self-check-perturbation'],
      rootCauseRepaired: true,
      unmatchedChangeCount: 0,
    },
    artifacts: {
      final: {
        diff: artifactFile('final-diff'),
        implementation: artifactFile('final'),
        reference: artifactFile('reference'),
      },
      perturbations: {
        'self-check-perturbation': {
          diff: artifactFile('self-check-perturbation-diff'),
          implementation: artifactFile('self-check-perturbation'),
          passed: true,
          reference: artifactFile('self-check-perturbation-reference'),
        },
      },
      policy: 'all',
      turns: {
        '1': {
          diff: artifactFile('turn-1-diff'),
          implementation: artifactFile('turn-1'),
          reference: artifactFile('reference'),
        },
      },
    },
    authMode: 'subscription',
    backend: 'codex-exec',
    backendVersion: 'self-check',
    billing: { mode: 'subscription' },
    budget: { mode: 'subscription' },
    finalComparison: passingComparison,
    status: 'passed',
    tokensUsed: 0,
    turnRecords: [
      {
        billing: { mode: 'subscription' },
        finishReason: 'stop',
        proposal: {
          changes: [{ property: 'padding', selector: '#atomic', value: '8px 16px' }],
          diagnosis: 'self-check repair',
        },
        requestAttempts: 1,
        retryDelaysMs: [],
        turn: 1,
        usage: {
          authMode: 'subscription',
          backend: 'codex-exec',
          backendVersion: 'self-check',
          inputTokens: 0,
          outputTokens: 0,
          requestedModel: 'self-check-model',
          totalTokens: 0,
        },
        visibleComparison: passingComparison,
      },
    ],
    turnTimeoutMs: 120_000,
  };
  const passed = parseEvalResult(passedRaw, 'passed self-check');
  if (
    passed.acceptance?.perturbationOutcomes?.[0]?.passed !== true ||
    passed.artifacts?.perturbations?.['self-check-perturbation']?.passed !== true
  ) {
    throw new Error('Perturbation outcome result contract self-check failed');
  }

  const protocolErrorWithArtifacts = parseEvalResult(
    {
      ...passedRaw,
      acceptance: undefined,
      artifacts: {
        final: passedRaw.artifacts.final,
        policy: 'all',
        turns: passedRaw.artifacts.turns,
      },
      maxTurns: 2,
      protocolErrors: 1,
      status: 'protocol_error',
      turnRecords: [
        passedRaw.turnRecords[0],
        {
          billing: { mode: 'subscription' },
          finishReason: 'stop',
          protocolError: 'self-check protocol error',
          requestAttempts: 1,
          retryDelaysMs: [],
          turn: 2,
          usage: {
            authMode: 'subscription',
            backend: 'codex-exec',
            backendVersion: 'self-check',
            inputTokens: 0,
            outputTokens: 0,
            requestedModel: 'self-check-model',
            totalTokens: 0,
          },
        },
      ],
      turns: 2,
    },
    'protocol artifact self-check'
  );
  if (
    protocolErrorWithArtifacts.artifacts?.final.implementation.path !== artifactFile('final').path
  ) {
    throw new Error('Protocol-error artifact result contract self-check failed');
  }

  const metered = parseEvalResult(
    {
      ...common,
      authMode: 'api',
      backend: 'openrouter',
      backendVersion: 'self-check',
      billing: { costUnknown: false, knownCostUsd: 0, mode: 'metered-usd' },
      budget: { commandBudgetUsd: 1, jobBudgetUsd: 1, mode: 'metered-usd' },
      status: 'aborted_budget',
      turnRecords: [],
      turns: 0,
    },
    'metered self-check'
  );
  if (metered.billing.mode !== 'metered-usd' || metered.billing.costUnknown) {
    throw new Error('Metered result contract self-check failed');
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function summarizeBilling(
  matches: EvalResult[],
  billingMode: ModelBilling['mode']
): Record<string, unknown> {
  if (billingMode === 'subscription') return { mode: 'subscription' };
  const costKnown = matches.filter(
    (result) => result.billing.mode === 'metered-usd' && !result.billing.costUnknown
  );
  const knownCosts = matches.map((result) =>
    result.billing.mode === 'metered-usd' ? result.billing.knownCostUsd : 0
  );
  return {
    averageKnownCostUsd: ratio(
      costKnown.reduce(
        (sum, result) =>
          sum + (result.billing.mode === 'metered-usd' ? result.billing.knownCostUsd : 0),
        0
      ),
      costKnown.length
    ),
    comparableKnownCostUsd: costKnown.reduce(
      (sum, result) =>
        sum + (result.billing.mode === 'metered-usd' ? result.billing.knownCostUsd : 0),
      0
    ),
    costKnownResults: costKnown.length,
    costUnknownResults: matches.length - costKnown.length,
    knownCostUsd: knownCosts.reduce((sum, value) => sum + value, 0),
    medianKnownCostUsd: median(
      costKnown.map((result) =>
        result.billing.mode === 'metered-usd' ? result.billing.knownCostUsd : 0
      )
    ),
    mode: 'metered-usd',
  };
}

function summarize(results: EvalResult[]): Record<string, unknown> {
  const billingMode = results[0]?.billing.mode;
  if (!billingMode) throw new TypeError('Cannot summarize an empty eval run');
  return Object.fromEntries(
    conditionIds.map((condition) => {
      const matches = results.filter((result) => result.condition === condition);
      const acceptances = matches.flatMap((result) =>
        result.acceptance ? [result.acceptance] : []
      );
      const usage = matches.flatMap((result) =>
        result.turnRecords.flatMap((turnRecord) => (turnRecord.usage ? [turnRecord.usage] : []))
      );
      const finalComparisons = matches.flatMap((result) =>
        result.finalComparison ? [result.finalComparison] : []
      );
      const comparisonPairs = matches.flatMap((result) =>
        result.finalComparison
          ? [{ final: result.finalComparison, initial: result.initialComparison }]
          : []
      );
      const perturbationsEvaluated = acceptances.reduce(
        (sum, acceptance) => sum + acceptance.perturbationsEvaluated,
        0
      );
      const perturbationsSurvived = acceptances.reduce(
        (sum, acceptance) => sum + acceptance.perturbationsSurvived.length,
        0
      );
      const visibleHiddenPairs = matches.filter(
        (result) => result.finalComparison?.pass === true && result.acceptance !== undefined
      );
      return [
        condition,
        {
          actualModels: [
            ...new Set(
              usage.flatMap((entry) => (entry.responseModel ? [entry.responseModel] : []))
            ),
          ].sort(),
          averageDfsDelta: ratio(
            comparisonPairs.reduce(
              (sum, comparison) => sum + (comparison.final.dfs - comparison.initial.dfs),
              0
            ),
            comparisonPairs.length
          ),
          averageFinalDfs: ratio(
            finalComparisons.reduce((sum, comparison) => sum + comparison.dfs, 0),
            finalComparisons.length
          ),
          averageInitialDfs: ratio(
            matches.reduce((sum, result) => sum + result.initialComparison.dfs, 0),
            matches.length
          ),
          averageTurns: ratio(
            matches.reduce((sum, result) => sum + result.turns, 0),
            matches.length
          ),
          billing: summarizeBilling(matches, billingMode),
          cachedInputTokens: usage.reduce((sum, entry) => sum + (entry.cachedInputTokens ?? 0), 0),
          fallbackTurns: usage.filter((entry) => entry.fallbackUsed === true).length,
          hiddenDivergenceRate: ratio(
            visibleHiddenPairs.filter((result) => result.acceptance?.accepted === false).length,
            visibleHiddenPairs.length
          ),
          inputTokens: usage.reduce((sum, entry) => sum + entry.inputTokens, 0),
          outputTokens: usage.reduce((sum, entry) => sum + entry.outputTokens, 0),
          perturbationSurvivalRate: ratio(perturbationsSurvived, perturbationsEvaluated),
          protocolErrors: matches.reduce((sum, result) => sum + result.protocolErrors, 0),
          providers: [
            ...new Set(usage.flatMap((entry) => (entry.provider ? [entry.provider] : []))),
          ].sort(),
          reasoningTokens: usage.reduce((sum, entry) => sum + (entry.reasoningTokens ?? 0), 0),
          results: matches.length,
          rootCauseRepairRate: ratio(
            acceptances.filter((acceptance) => acceptance.rootCauseRepaired).length,
            acceptances.length
          ),
          routingMetadataErrors: usage.filter((entry) => entry.routingMetadataError !== undefined)
            .length,
          statusCounts: Object.fromEntries(
            ['aborted_budget', 'error', 'passed', 'protocol_error', 'repair_failed'].map(
              (status) => [status, matches.filter((result) => result.status === status).length]
            )
          ),
          totalTokens: usage.reduce((sum, entry) => sum + entry.totalTokens, 0),
          unmatchedChangeCount: acceptances.reduce(
            (sum, acceptance) => sum + acceptance.unmatchedChangeCount,
            0
          ),
          visiblePassRate: ratio(
            finalComparisons.filter((comparison) => comparison.pass).length,
            finalComparisons.length
          ),
        },
      ];
    })
  );
}

function parseRunArgument(args: string[]): string | undefined {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (normalized.length === 0) return undefined;
  if (normalized.length !== 2 || normalized[0] !== '--run' || !normalized[1]) {
    throw new ReportUsageError('Usage: pnpm eval:report -- [--run <run-id>]');
  }
  if (!evalRunIdPattern.test(normalized[1])) {
    throw new ReportUsageError('--run must use YYYYMMDD_<name>');
  }
  return normalized[1];
}

function runDirectory(file: string): string {
  return file.split(sep)[0] ?? file;
}

function assertResultPath(result: EvalResult, file: string): void {
  const segments = file.split(sep);
  const expected = [
    result.runId,
    result.fixtureId,
    result.mutationId,
    result.condition,
    `${result.trial}.json`,
  ];
  if (
    segments.length !== expected.length ||
    !segments.every((segment, index) => segment === expected[index])
  ) {
    throw new TypeError(`${file} does not match its result identity`);
  }
}

export async function loadEvalRunResults(runId: string): Promise<StoredEvalResult[]> {
  const runDirectory = resolve(evalRoot, 'results', runId);
  const files = (await readdir(runDirectory, { recursive: true }))
    .filter((file) => file.endsWith('.json'))
    .sort();
  return await Promise.all(
    files.map(async (file) => {
      const path = resolve(runDirectory, file);
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8')) as unknown;
      const raw = asRecord(parsed, `${runId}/${file}`);
      const result = parseEvalResult(raw, `${runId}/${file}`);
      assertResultPath(result, `${runId}${sep}${file}`);
      return { path, raw, result };
    })
  );
}

function singleton<T>(values: T[], label: string): T {
  const unique = [...new Set(values)];
  if (unique.length !== 1 || unique[0] === undefined) {
    throw new ReportUsageError(`A run must contain one ${label}. Use separate run IDs.`);
  }
  return unique[0];
}

function summarizeTopLevelBilling(results: EvalResult[]): Record<string, unknown> {
  if (results[0]?.billing.mode === 'subscription') return { mode: 'subscription' };
  const known = results.filter(
    (result) => result.billing.mode === 'metered-usd' && !result.billing.costUnknown
  );
  return {
    comparableKnownCostUsd: known.reduce(
      (sum, result) =>
        sum + (result.billing.mode === 'metered-usd' ? result.billing.knownCostUsd : 0),
      0
    ),
    costKnownResults: known.length,
    costUnknownResults: results.length - known.length,
    knownCostUsd: results.reduce(
      (sum, result) =>
        sum + (result.billing.mode === 'metered-usd' ? result.billing.knownCostUsd : 0),
      0
    ),
    mode: 'metered-usd',
  };
}

function summarizeTopLevelBudget(budget: EvalBudget, trials: number[]): Record<string, unknown> {
  if (budget.mode === 'subscription') return { mode: 'subscription' };
  return {
    aggregateBudgetUsd: budget.commandBudgetUsd * trials.length,
    budgetUsdPerTrial: budget.commandBudgetUsd,
    jobBudgetUsd: budget.jobBudgetUsd,
    mode: 'metered-usd',
  };
}

async function main(): Promise<void> {
  const requestedRunId = parseRunArgument(process.argv.slice(2));
  const resultsDirectory = resolve(evalRoot, 'results');
  let files: string[];
  try {
    files = (await readdir(resultsDirectory, { recursive: true }))
      .filter((file) => file.endsWith('.json'))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ReportUsageError('No eval results found. Run pnpm eval:run first.');
    }
    throw error;
  }
  if (files.length === 0) {
    throw new ReportUsageError('No eval results found. Run pnpm eval:run first.');
  }

  const availableRunIds = [...new Set(files.map(runDirectory))].sort();
  if (!requestedRunId && availableRunIds.length !== 1) {
    throw new ReportUsageError(
      `Multiple eval runs found (${availableRunIds.join(', ')}). Select one with --run.`
    );
  }
  const runId = requestedRunId ?? availableRunIds[0];
  if (!runId || !availableRunIds.includes(runId)) {
    throw new ReportUsageError(`No eval results found for run ${runId ?? '(unknown)'}.`);
  }
  const results = (await loadEvalRunResults(runId)).map((stored) => stored.result);
  if (results.some((result) => result.runId !== runId)) {
    throw new TypeError(`Result contents do not match selected run directory ${runId}`);
  }

  const backend = singleton(
    results.map((result) => result.backend),
    'backend'
  );
  const backendVersion = singleton(
    results.map((result) => result.backendVersion),
    'backend version'
  );
  const authMode = singleton(
    results.map((result) => result.authMode),
    'auth mode'
  );
  const model = singleton(
    results.map((result) => result.model),
    'requested model'
  );
  const uimatchCommit = singleton(
    results.map((result) => result.uimatchCommit),
    'uiMatch commit'
  );
  const maxTurns = singleton(
    results.map((result) => result.maxTurns),
    'turn limit'
  );
  const turnTimeoutMs = singleton(
    results.map((result) => result.turnTimeoutMs ?? null),
    'turn timeout'
  );
  const serializedBudget = singleton(
    results.map((result) => JSON.stringify(result.budget)),
    'budget policy'
  );
  const budget = parseBudget(JSON.parse(serializedBudget) as unknown, 'selected run budget');
  const trials = [...new Set(results.map((result) => result.trial))].sort(
    (left, right) => left - right
  );

  console.log(
    JSON.stringify(
      {
        authMode,
        backend,
        backendVersion,
        billing: summarizeTopLevelBilling(results),
        budget: summarizeTopLevelBudget(budget, trials),
        byCondition: summarize(results),
        maxTurns,
        requestedModel: model,
        results: results.length,
        runId,
        tokensUsed: results.reduce((sum, result) => sum + result.tokensUsed, 0),
        trials,
        ...(turnTimeoutMs === null ? {} : { turnTimeoutMs }),
        uimatchCommit,
      },
      null,
      2
    )
  );
}

function handleMainError(error: unknown): void {
  if (error instanceof ReportUsageError) {
    console.error(`Eval report error: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  void main().catch(handleMainError);
}
