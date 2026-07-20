import { readdir, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { evalRoot } from '../manifest.js';
import {
  conditionIds,
  conditionOrderForTrial,
  evalIdentifierPattern,
  type ConditionId,
  type EvalResult,
  type EvalStatus,
  type EvalTurnRecord,
  type HiddenAcceptanceResult,
  type ModelBillingUsage,
  type ModelTurnUsage,
  type RepairChange,
  type RepairProposal,
  type VisibleComparisonMetrics,
} from '../types.js';

class ReportUsageError extends Error {}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
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

function parseRepairChange(value: unknown, label: string): RepairChange {
  const record = asRecord(value, label);
  return {
    property: asString(record.property, `${label}.property`),
    selector: asString(record.selector, `${label}.selector`),
    value: asString(record.value, `${label}.value`),
  };
}

function parseProposal(value: unknown, label: string): RepairProposal {
  const record = asRecord(value, label);
  if (!Array.isArray(record.changes) || record.changes.length === 0) {
    throw new TypeError(`${label}.changes must be a non-empty array`);
  }
  return {
    changes: record.changes.map((change, index) =>
      parseRepairChange(change, `${label}.changes[${index}]`)
    ),
    diagnosis: asString(record.diagnosis, `${label}.diagnosis`),
  };
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

function parseBillingUsage(value: unknown, label: string): ModelBillingUsage {
  const record = asRecord(value, label);
  const completionTokens = asNonNegativeInteger(
    record.completionTokens,
    `${label}.completionTokens`
  );
  const promptTokens = asNonNegativeInteger(record.promptTokens, `${label}.promptTokens`);
  const totalTokens = asNonNegativeInteger(record.totalTokens, `${label}.totalTokens`);
  if (promptTokens + completionTokens !== totalTokens) {
    throw new TypeError(`${label} token totals are inconsistent`);
  }
  return {
    completionTokens,
    costUsd: asNonNegativeNumber(record.costUsd, `${label}.costUsd`),
    promptTokens,
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
  const billing = parseBillingUsage(record, label);
  const provider = asOptionalString(record.provider, `${label}.provider`);
  const routingMetadataError = asOptionalString(
    record.routingMetadataError,
    `${label}.routingMetadataError`
  );
  return {
    ...billing,
    ...(record.fallbackUsed === undefined
      ? {}
      : { fallbackUsed: asBoolean(record.fallbackUsed, `${label}.fallbackUsed`) }),
    generationId: asString(record.generationId, `${label}.generationId`),
    ...(provider ? { provider } : {}),
    responseModel: asString(record.responseModel, `${label}.responseModel`),
    ...(routingMetadataError ? { routingMetadataError } : {}),
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
  const finishReason = asOptionalString(record.finishReason, `${label}.finishReason`);
  const usage =
    record.usage === undefined ? undefined : parseTurnUsage(record.usage, `${label}.usage`);
  const partialUsage =
    record.partialUsage === undefined
      ? undefined
      : parseBillingUsage(record.partialUsage, `${label}.partialUsage`);
  if (usage && partialUsage) {
    throw new TypeError(`${label} cannot contain both usage and partialUsage`);
  }
  if ((finishReason === undefined) !== (usage === undefined)) {
    throw new TypeError(`${label}.finishReason and usage must describe the same response`);
  }
  if (finishReason === undefined && record.error === undefined) {
    throw new TypeError(`${label}.error is required when no model response was returned`);
  }
  const costUnknown = asBoolean(record.costUnknown, `${label}.costUnknown`);
  if (costUnknown === (usage !== undefined || partialUsage !== undefined)) {
    throw new TypeError(`${label}.costUnknown must reflect whether billing usage was recorded`);
  }
  return {
    costUnknown,
    ...(record.error === undefined ? {} : { error: asString(record.error, `${label}.error`) }),
    ...(finishReason ? { finishReason } : {}),
    ...(partialUsage ? { partialUsage } : {}),
    ...(record.proposal === undefined
      ? {}
      : { proposal: parseProposal(record.proposal, `${label}.proposal`) }),
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

function parseAcceptance(value: unknown, label: string): HiddenAcceptanceResult {
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
  return {
    accepted: asBoolean(record.accepted, `${label}.accepted`),
    finalComparisonPassed: asBoolean(
      record.finalComparisonPassed,
      `${label}.finalComparisonPassed`
    ),
    ...(matchedRepairIndex === undefined ? {} : { matchedRepairIndex }),
    perturbationsEvaluated,
    perturbationsSurvived,
    rootCauseRepaired: asBoolean(record.rootCauseRepaired, `${label}.rootCauseRepaired`),
    unmatchedChangeCount: asNonNegativeInteger(
      record.unmatchedChangeCount,
      `${label}.unmatchedChangeCount`
    ),
  };
}

function sameVisibleComparison(
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

function parseResult(value: unknown, file: string): EvalResult {
  const record = asRecord(value, file);
  if (record.schemaVersion !== 2) {
    throw new TypeError(`${file}.schemaVersion must be 2`);
  }
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
  if (turns !== turnRecords.length) {
    throw new TypeError(`${file}.turns does not match turnRecords`);
  }
  const billingUsages = turnRecords.flatMap((turnRecord) => {
    if (turnRecord.usage) return [turnRecord.usage];
    return turnRecord.partialUsage ? [turnRecord.partialUsage] : [];
  });
  const tokensUsed = asNonNegativeInteger(record.tokensUsed, `${file}.tokensUsed`);
  const knownCostUsd = asNonNegativeNumber(record.knownCostUsd, `${file}.knownCostUsd`);
  if (billingUsages.reduce((sum, usage) => sum + usage.totalTokens, 0) !== tokensUsed) {
    throw new TypeError(`${file}.tokensUsed does not match turnRecords`);
  }
  const turnCost = billingUsages.reduce((sum, usage) => sum + usage.costUsd, 0);
  if (Math.abs(turnCost - knownCostUsd) > 1e-9) {
    throw new TypeError(`${file}.knownCostUsd does not match turnRecords`);
  }
  const costUnknown = asBoolean(record.costUnknown, `${file}.costUnknown`);
  if (costUnknown !== turnRecords.some((turnRecord) => turnRecord.costUnknown)) {
    throw new TypeError(`${file}.costUnknown does not match turnRecords`);
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
  if (!sameVisibleComparison(finalComparison, derivedFinalComparison)) {
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
      : parseAcceptance(record.acceptance, `${file}.acceptance`);
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
  if (costUnknown && status !== 'error') {
    throw new TypeError(`${file}.costUnknown requires error status`);
  }
  return {
    ...(acceptance ? { acceptance } : {}),
    commandBudgetUsd: asPositiveNumber(record.commandBudgetUsd, `${file}.commandBudgetUsd`),
    condition: asCondition(record.condition, `${file}.condition`),
    conditionOrder,
    costUnknown,
    ...(error ? { error } : {}),
    ...(finalComparison ? { finalComparison } : {}),
    fixtureId: asString(record.fixtureId, `${file}.fixtureId`),
    initialComparison,
    jobBudgetUsd: asPositiveNumber(record.jobBudgetUsd, `${file}.jobBudgetUsd`),
    knownCostUsd,
    maxTurns: asPositiveInteger(record.maxTurns, `${file}.maxTurns`),
    model: asString(record.model, `${file}.model`),
    mutationId: asString(record.mutationId, `${file}.mutationId`),
    promptHash: asString(record.promptHash, `${file}.promptHash`),
    protocolErrors,
    runId: asString(record.runId, `${file}.runId`),
    schemaVersion: 2,
    status,
    tokensUsed,
    trial,
    turnRecords,
    turns,
    uimatchCommit: asString(record.uimatchCommit, `${file}.uimatchCommit`),
  };
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

function summarize(results: EvalResult[]): Record<string, unknown> {
  return Object.fromEntries(
    conditionIds.map((condition) => {
      const matches = results.filter((result) => result.condition === condition);
      const costKnownMatches = matches.filter((result) => !result.costUnknown);
      const acceptances = matches.flatMap((result) =>
        result.acceptance ? [result.acceptance] : []
      );
      const successfulUsage = matches.flatMap((result) =>
        result.turnRecords.flatMap((turnRecord) => (turnRecord.usage ? [turnRecord.usage] : []))
      );
      const billingUsage = matches.flatMap((result) =>
        result.turnRecords.flatMap((turnRecord) => {
          if (turnRecord.usage) return [turnRecord.usage];
          return turnRecord.partialUsage ? [turnRecord.partialUsage] : [];
        })
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
          actualModels: [...new Set(successfulUsage.map((usage) => usage.responseModel))].sort(),
          averageKnownCostUsd: ratio(
            costKnownMatches.reduce((sum, result) => sum + result.knownCostUsd, 0),
            costKnownMatches.length
          ),
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
          completionTokens: billingUsage.reduce((sum, usage) => sum + usage.completionTokens, 0),
          comparableKnownCostUsd: costKnownMatches.reduce(
            (sum, result) => sum + result.knownCostUsd,
            0
          ),
          costKnownResults: costKnownMatches.length,
          costUnknownResults: matches.length - costKnownMatches.length,
          fallbackTurns: successfulUsage.filter((usage) => usage.fallbackUsed === true).length,
          hiddenDivergenceRate: ratio(
            visibleHiddenPairs.filter((result) => result.acceptance?.accepted === false).length,
            visibleHiddenPairs.length
          ),
          knownCostUsd: matches.reduce((sum, result) => sum + result.knownCostUsd, 0),
          medianKnownCostUsd: median(costKnownMatches.map((result) => result.knownCostUsd)),
          perturbationSurvivalRate: ratio(perturbationsSurvived, perturbationsEvaluated),
          promptTokens: billingUsage.reduce((sum, usage) => sum + usage.promptTokens, 0),
          protocolErrors: matches.reduce((sum, result) => sum + result.protocolErrors, 0),
          providers: [
            ...new Set(
              successfulUsage.flatMap((usage) => (usage.provider ? [usage.provider] : []))
            ),
          ].sort(),
          reasoningTokens: billingUsage.reduce(
            (sum, usage) => sum + (usage.reasoningTokens ?? 0),
            0
          ),
          routingMetadataErrors: successfulUsage.filter(
            (usage) => usage.routingMetadataError !== undefined
          ).length,
          rootCauseRepairRate: ratio(
            acceptances.filter((acceptance) => acceptance.rootCauseRepaired).length,
            acceptances.length
          ),
          results: matches.length,
          statusCounts: Object.fromEntries(
            ['aborted_budget', 'error', 'passed', 'protocol_error', 'repair_failed'].map(
              (status) => [status, matches.filter((result) => result.status === status).length]
            )
          ),
          totalTokens: billingUsage.reduce((sum, usage) => sum + usage.totalTokens, 0),
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
  if (!evalIdentifierPattern.test(normalized[1])) {
    throw new ReportUsageError('--run must be a safe eval identifier');
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
  const selectedFiles = files.filter((file) => runDirectory(file) === runId);
  const results = await Promise.all(
    selectedFiles.map(async (file) => {
      const parsed: unknown = JSON.parse(
        await readFile(resolve(resultsDirectory, file), 'utf8')
      ) as unknown;
      const result = parseResult(parsed, file);
      assertResultPath(result, file);
      return result;
    })
  );
  if (results.some((result) => result.runId !== runId)) {
    throw new TypeError(`Result contents do not match selected run directory ${runId}`);
  }
  const models = [...new Set(results.map((result) => result.model))];
  const commits = [...new Set(results.map((result) => result.uimatchCommit))];
  const budgets = [...new Set(results.map((result) => result.commandBudgetUsd))];
  const jobBudgets = [...new Set(results.map((result) => result.jobBudgetUsd))];
  const turnLimits = [...new Set(results.map((result) => result.maxTurns))];
  if (
    models.length !== 1 ||
    commits.length !== 1 ||
    budgets.length !== 1 ||
    jobBudgets.length !== 1 ||
    turnLimits.length !== 1
  ) {
    throw new ReportUsageError(
      'A run must contain one requested model, uiMatch commit, command budget, and turn limit. Use separate run IDs.'
    );
  }
  const budgetUsdPerTrial = budgets[0];
  if (budgetUsdPerTrial === undefined) {
    throw new ReportUsageError('The selected run does not contain a command budget.');
  }

  const trials = [...new Set(results.map((result) => result.trial))].sort(
    (left, right) => left - right
  );
  const costKnownResults = results.filter((result) => !result.costUnknown);
  console.log(
    JSON.stringify(
      {
        byCondition: summarize(results),
        aggregateBudgetUsd: budgetUsdPerTrial * trials.length,
        budgetUsdPerTrial,
        costKnownResults: costKnownResults.length,
        costUnknownResults: results.length - costKnownResults.length,
        comparableKnownCostUsd: costKnownResults.reduce(
          (sum, result) => sum + result.knownCostUsd,
          0
        ),
        knownCostUsd: results.reduce((sum, result) => sum + result.knownCostUsd, 0),
        jobBudgetUsd: jobBudgets[0],
        requestedModel: models[0],
        results: results.length,
        runId,
        tokensUsed: results.reduce((sum, result) => sum + result.tokensUsed, 0),
        maxTurns: turnLimits[0],
        trials,
        uimatchCommit: commits[0],
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  if (error instanceof ReportUsageError) {
    console.error(`Eval report error: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
