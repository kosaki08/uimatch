import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evalRoot } from '../manifest.js';
import { conditionIds, type ConditionId, type EvalResult, type EvalStatus } from '../types.js';

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

function asCondition(value: unknown, label: string): ConditionId {
  if (!conditionIds.some((condition) => condition === value)) {
    throw new TypeError(`${label} must be a known eval condition`);
  }
  return value as ConditionId;
}

function asStatus(value: unknown, label: string): EvalStatus {
  const statuses: EvalStatus[] = ['aborted_budget', 'error', 'failed', 'passed'];
  if (!statuses.some((status) => status === value)) {
    throw new TypeError(`${label} must be a known eval status`);
  }
  return value as EvalStatus;
}

function parseResult(value: unknown, file: string): EvalResult {
  const record = asRecord(value, file);
  return {
    condition: asCondition(record.condition, `${file}.condition`),
    costUsd: asNonNegativeNumber(record.costUsd, `${file}.costUsd`),
    fixtureId: asString(record.fixtureId, `${file}.fixtureId`),
    model: asString(record.model, `${file}.model`),
    mutationId: asString(record.mutationId, `${file}.mutationId`),
    promptHash: asString(record.promptHash, `${file}.promptHash`),
    status: asStatus(record.status, `${file}.status`),
    tokensUsed: asNonNegativeInteger(record.tokensUsed, `${file}.tokensUsed`),
    turns: asNonNegativeInteger(record.turns, `${file}.turns`),
    uimatchCommit: asString(record.uimatchCommit, `${file}.uimatchCommit`),
  };
}

async function main(): Promise<void> {
  const resultsDirectory = resolve(evalRoot, 'results');
  let files: string[];
  try {
    files = (await readdir(resultsDirectory)).filter((file) => file.endsWith('.json')).sort();
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
  const byCondition = Object.fromEntries(
    conditionIds.map((condition) => {
      const matches = results.filter((result) => result.condition === condition);
      return [
        condition,
        {
          costUsd: matches.reduce((sum, result) => sum + result.costUsd, 0),
          passed: matches.filter((result) => result.status === 'passed').length,
          runs: matches.length,
          tokensUsed: matches.reduce((sum, result) => sum + result.tokensUsed, 0),
        },
      ];
    })
  );
  console.log(
    JSON.stringify(
      {
        byCondition,
        costUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
        runs: results.length,
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
