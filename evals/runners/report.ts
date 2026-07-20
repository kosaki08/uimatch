import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evalRoot } from '../manifest.js';
import {
  conditionIds,
  type ConditionId,
  type EvalResult,
  type EvalStatus,
  type HiddenAcceptanceResult,
  type ModelTurnUsage,
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

function parseTurnUsage(value: unknown, label: string): ModelTurnUsage {
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
  const provider = asOptionalString(record.provider, `${label}.provider`);
  return {
    completionTokens,
    costUsd: asNonNegativeNumber(record.costUsd, `${label}.costUsd`),
    ...(record.fallbackUsed === undefined
      ? {}
      : { fallbackUsed: asBoolean(record.fallbackUsed, `${label}.fallbackUsed`) }),
    generationId: asString(record.generationId, `${label}.generationId`),
    promptTokens,
    ...(provider ? { provider } : {}),
    ...(record.reasoningTokens === undefined
      ? {}
      : {
          reasoningTokens: asNonNegativeInteger(record.reasoningTokens, `${label}.reasoningTokens`),
        }),
    responseModel: asString(record.responseModel, `${label}.responseModel`),
    totalTokens,
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
  return {
    accepted: asBoolean(record.accepted, `${label}.accepted`),
    finalComparisonPassed: asBoolean(
      record.finalComparisonPassed,
      `${label}.finalComparisonPassed`
    ),
    ...(matchedRepairIndex === undefined ? {} : { matchedRepairIndex }),
    perturbationsEvaluated: asNonNegativeInteger(
      record.perturbationsEvaluated,
      `${label}.perturbationsEvaluated`
    ),
    perturbationsSurvived: record.perturbationsSurvived.map((entry, index) =>
      asString(entry, `${label}.perturbationsSurvived[${index}]`)
    ),
    rootCauseRepaired: asBoolean(record.rootCauseRepaired, `${label}.rootCauseRepaired`),
    symptomPatchCount: asNonNegativeInteger(record.symptomPatchCount, `${label}.symptomPatchCount`),
  };
}

function parseResult(value: unknown, file: string): EvalResult {
  const record = asRecord(value, file);
  if (!Array.isArray(record.turnUsage)) {
    throw new TypeError(`${file}.turnUsage must be an array`);
  }
  const turnUsage = record.turnUsage.map((entry, index) =>
    parseTurnUsage(entry, `${file}.turnUsage[${index}]`)
  );
  const tokensUsed = asNonNegativeInteger(record.tokensUsed, `${file}.tokensUsed`);
  const costUsd = asNonNegativeNumber(record.costUsd, `${file}.costUsd`);
  if (turnUsage.reduce((sum, usage) => sum + usage.totalTokens, 0) !== tokensUsed) {
    throw new TypeError(`${file}.tokensUsed does not match turnUsage`);
  }
  const turnCost = turnUsage.reduce((sum, usage) => sum + usage.costUsd, 0);
  if (Math.abs(turnCost - costUsd) > 1e-9) {
    throw new TypeError(`${file}.costUsd does not match turnUsage`);
  }
  return {
    ...(record.acceptance === undefined
      ? {}
      : { acceptance: parseAcceptance(record.acceptance, `${file}.acceptance`) }),
    condition: asCondition(record.condition, `${file}.condition`),
    costUsd,
    fixtureId: asString(record.fixtureId, `${file}.fixtureId`),
    model: asString(record.model, `${file}.model`),
    mutationId: asString(record.mutationId, `${file}.mutationId`),
    promptHash: asString(record.promptHash, `${file}.promptHash`),
    protocolErrors: asNonNegativeInteger(record.protocolErrors, `${file}.protocolErrors`),
    runId: asString(record.runId, `${file}.runId`),
    status: asStatus(record.status, `${file}.status`),
    tokensUsed,
    trial: asPositiveInteger(record.trial, `${file}.trial`),
    turns: asNonNegativeInteger(record.turns, `${file}.turns`),
    turnUsage,
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
      const acceptances = matches.flatMap((result) =>
        result.acceptance ? [result.acceptance] : []
      );
      const turnUsage = matches.flatMap((result) => result.turnUsage);
      const perturbationsEvaluated = acceptances.reduce(
        (sum, acceptance) => sum + acceptance.perturbationsEvaluated,
        0
      );
      const perturbationsSurvived = acceptances.reduce(
        (sum, acceptance) => sum + acceptance.perturbationsSurvived.length,
        0
      );
      return [
        condition,
        {
          actualModels: [...new Set(turnUsage.map((usage) => usage.responseModel))].sort(),
          averageCostUsd: ratio(
            matches.reduce((sum, result) => sum + result.costUsd, 0),
            matches.length
          ),
          averageTurns: ratio(
            matches.reduce((sum, result) => sum + result.turns, 0),
            matches.length
          ),
          completionTokens: turnUsage.reduce((sum, usage) => sum + usage.completionTokens, 0),
          costUsd: matches.reduce((sum, result) => sum + result.costUsd, 0),
          fallbackTurns: turnUsage.filter((usage) => usage.fallbackUsed === true).length,
          medianCostUsd: median(matches.map((result) => result.costUsd)),
          perturbationSurvivalRate: ratio(perturbationsSurvived, perturbationsEvaluated),
          promptTokens: turnUsage.reduce((sum, usage) => sum + usage.promptTokens, 0),
          protocolErrors: matches.reduce((sum, result) => sum + result.protocolErrors, 0),
          providers: [
            ...new Set(turnUsage.flatMap((usage) => (usage.provider ? [usage.provider] : []))),
          ].sort(),
          reasoningTokens: turnUsage.reduce((sum, usage) => sum + (usage.reasoningTokens ?? 0), 0),
          requestedModels: [...new Set(matches.map((result) => result.model))].sort(),
          rootCauseRepairRate: ratio(
            acceptances.filter((acceptance) => acceptance.rootCauseRepaired).length,
            acceptances.length
          ),
          runs: matches.length,
          statusCounts: Object.fromEntries(
            ['aborted_budget', 'error', 'passed', 'protocol_error', 'repair_failed'].map(
              (status) => [status, matches.filter((result) => result.status === status).length]
            )
          ),
          symptomPatchCount: acceptances.reduce(
            (sum, acceptance) => sum + acceptance.symptomPatchCount,
            0
          ),
          totalTokens: turnUsage.reduce((sum, usage) => sum + usage.totalTokens, 0),
        },
      ];
    })
  );
}

async function main(): Promise<void> {
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

  const results = await Promise.all(
    files.map(async (file) => {
      const parsed: unknown = JSON.parse(
        await readFile(resolve(resultsDirectory, file), 'utf8')
      ) as unknown;
      return parseResult(parsed, file);
    })
  );
  console.log(
    JSON.stringify(
      {
        byCondition: summarize(results),
        costUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
        runs: results.length,
        runIds: [...new Set(results.map((result) => result.runId))].sort(),
        tokensUsed: results.reduce((sum, result) => sum + result.tokensUsed, 0),
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
