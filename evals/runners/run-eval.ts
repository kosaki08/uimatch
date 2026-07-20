import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { access, link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildFlatDiffFeedback } from '../conditions/flat-diff.js';
import { buildPixelDiffFeedback } from '../conditions/pixel-diff.js';
import { buildScalarFeedback } from '../conditions/scalar.js';
import {
  compareVariant,
  createFixtureContext,
  evaluateFinalProposal,
  type RenderedReference,
} from '../harness.js';
import { evalRoot, loadManifest } from '../manifest.js';
import type { RepairWorkspace } from '../repair-workspace.js';
import {
  conditionIds,
  conditionOrderForTrial,
  evalIdentifierPattern,
  type ComparisonSnapshot,
  type ConditionFeedback,
  type ConditionId,
  type EvalManifest,
  type EvalMutation,
  type EvalResult,
  type EvalStatus,
  type EvalTurnRecord,
  type HiddenAcceptanceResult,
  type RepairChange,
  type RepairProposal,
  type VisibleComparisonMetrics,
} from '../types.js';
import { buildCli, EvalUsageError } from './build-cli.js';
import type { EvalFixtureServer } from './fixture-server.js';
import { OpenRouterCallError, requestOpenRouterTurn, type ModelMessage } from './openrouter.js';
import { runSelfCheck } from './self-check.js';

interface EvalConfig {
  apiKey: string;
  commandBudgetUsd: number;
  conditionOrder: ConditionId[];
  maxTurns: number;
  model: string;
  runId: string;
  trial: number;
  uimatchCommit: string;
}

interface JobContext {
  condition: ConditionId;
  config: EvalConfig;
  initialComparison: VisibleComparisonMetrics;
  jobBudgetUsd: number;
  manifest: EvalManifest;
  mutation: EvalMutation;
}

interface JobState {
  promptHash: string;
  turnRecords: EvalTurnRecord[];
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new EvalUsageError(`${name} is required. See evals/README.md.`);
  return value;
}

function parsePositiveIntegerValue(name: string, raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new EvalUsageError(`${name} must be a positive safe integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new EvalUsageError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function parsePositiveNumber(name: string): number {
  const raw = requireEnvironment(name);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new EvalUsageError(`${name} must be a positive finite number.`);
  }
  return value;
}

function parseRunId(): string {
  const value = process.env.EVAL_RUN_ID?.trim() || randomUUID();
  if (!evalIdentifierPattern.test(value)) {
    throw new EvalUsageError(
      'EVAL_RUN_ID must contain only letters, numbers, dots, underscores, and hyphens.'
    );
  }
  return value;
}

function loadEvalConfig(): EvalConfig {
  const trialValue = process.env.EVAL_TRIAL?.trim();
  const trial = trialValue ? parsePositiveIntegerValue('EVAL_TRIAL', trialValue) : 1;
  return {
    apiKey: requireEnvironment('OPENROUTER_API_KEY'),
    commandBudgetUsd: parsePositiveNumber('EVAL_BUDGET_USD'),
    conditionOrder: conditionOrderForTrial(trial),
    maxTurns: parsePositiveIntegerValue('EVAL_MAX_TURNS', requireEnvironment('EVAL_MAX_TURNS')),
    model: requireEnvironment('EVAL_MODEL'),
    runId: parseRunId(),
    trial,
    uimatchCommit: requireEnvironment('UIMATCH_EVAL_COMMIT'),
  };
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

function buildConditionFeedback(
  condition: ConditionId,
  comparison: ComparisonSnapshot
): ConditionFeedback {
  switch (condition) {
    case 'pixel-diff':
      return buildPixelDiffFeedback(comparison);
    case 'scalar':
      return buildScalarFeedback(comparison);
    case 'flat-diff':
      return buildFlatDiffFeedback(comparison);
  }
}

function parseRepairProposal(content: string): RepairProposal {
  const parsed: unknown = JSON.parse(content) as unknown;
  const record = asRecord(parsed, 'model response');
  if (!Array.isArray(record.changes) || record.changes.length === 0) {
    throw new TypeError('model response changes must be a non-empty array');
  }
  if (record.changes.length > 20) {
    throw new RangeError('model response changes must not exceed 20 entries');
  }
  const changes: RepairChange[] = record.changes.map((change, index) => {
    const changeRecord = asRecord(change, `model response changes[${index}]`);
    return {
      property: asString(changeRecord.property, `model response changes[${index}].property`),
      selector: asString(changeRecord.selector, `model response changes[${index}].selector`),
      value: asString(changeRecord.value, `model response changes[${index}].value`),
    };
  });
  return {
    changes,
    diagnosis: asString(record.diagnosis, 'model response diagnosis'),
  };
}

function feedbackContent(prefix: string, feedback: ConditionFeedback): ModelMessage['content'] {
  const content: Extract<ModelMessage['content'], unknown[]> = [
    { text: `${prefix}\n\n${feedback.text}`, type: 'text' },
  ];
  for (const image of feedback.images) {
    content.push({ text: image.label, type: 'text' });
    content.push({ image_url: { url: image.dataUrl }, type: 'image_url' });
  }
  return content;
}

function buildInitialMessages(
  workspace: RepairWorkspace,
  feedback: ConditionFeedback
): ModelMessage[] {
  const prompt = [
    'Repair the current UI so that it matches the reference rendering.',
    'Return a complete CSS change proposal against the original current styles.css. Each later proposal replaces the previous proposal.',
    'Return JSON only with this shape:',
    '{"diagnosis":"...","changes":[{"selector":"...","property":"...","value":"..."}]}',
    'current index.html:',
    workspace.implementationSource.html,
    'current styles.css:',
    workspace.implementationSource.css,
  ].join('\n\n');
  return [
    {
      content:
        'You repair HTML and CSS from visual comparison feedback. Return the requested JSON and no Markdown.',
      role: 'system',
    },
    { content: feedbackContent(prompt, feedback), role: 'user' },
  ];
}

function hashMessages(messages: ModelMessage[]): string {
  return createHash('sha256').update(JSON.stringify(messages)).digest('hex');
}

function createJobState(promptHash: string): JobState {
  return {
    promptHash,
    turnRecords: [],
  };
}

function recordedBillingUsages(state: JobState) {
  return state.turnRecords.flatMap((record) => {
    if (record.usage) return [record.usage];
    return record.partialUsage ? [record.partialUsage] : [];
  });
}

function jobCostUsd(state: JobState): number {
  return recordedBillingUsages(state).reduce((sum, usage) => sum + usage.costUsd, 0);
}

function buildResult(
  context: JobContext,
  state: JobState,
  status: EvalStatus,
  extras: { acceptance?: HiddenAcceptanceResult; error?: string } = {}
): EvalResult {
  const usages = recordedBillingUsages(state);
  const finalComparison = [...state.turnRecords]
    .reverse()
    .find((record) => record.visibleComparison !== undefined)?.visibleComparison;
  return {
    ...(extras.acceptance ? { acceptance: extras.acceptance } : {}),
    commandBudgetUsd: context.config.commandBudgetUsd,
    condition: context.condition,
    conditionOrder: context.config.conditionOrder,
    costUnknown: state.turnRecords.some((record) => record.costUnknown),
    ...(extras.error ? { error: extras.error } : {}),
    ...(finalComparison ? { finalComparison } : {}),
    fixtureId: context.manifest.fixtureId,
    initialComparison: context.initialComparison,
    jobBudgetUsd: context.jobBudgetUsd,
    knownCostUsd: jobCostUsd(state),
    maxTurns: context.config.maxTurns,
    model: context.config.model,
    mutationId: context.mutation.id,
    promptHash: state.promptHash,
    protocolErrors: state.turnRecords.filter((record) => record.protocolError !== undefined).length,
    runId: context.config.runId,
    schemaVersion: 2,
    status,
    tokensUsed: usages.reduce((sum, usage) => sum + usage.totalTokens, 0),
    trial: context.config.trial,
    turnRecords: state.turnRecords,
    turns: state.turnRecords.length,
    uimatchCommit: context.config.uimatchCommit,
  };
}

function isProposalError(error: unknown): error is SyntaxError | TypeError | RangeError {
  return error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError;
}

async function writeResult(result: EvalResult): Promise<void> {
  const destination = resultDestination(result);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  try {
    await link(temporary, destination);
  } finally {
    await unlink(temporary);
  }
}

function resultDestination(identity: {
  condition: ConditionId;
  fixtureId: string;
  mutationId: string;
  runId: string;
  trial: number;
}): string {
  const segments = [
    identity.runId,
    identity.fixtureId,
    identity.mutationId,
    identity.condition,
    String(identity.trial),
  ];
  if (!segments.every((segment) => evalIdentifierPattern.test(segment))) {
    throw new RangeError('Eval result identifiers must be safe path segments');
  }
  return resolve(
    evalRoot,
    'results',
    identity.runId,
    identity.fixtureId,
    identity.mutationId,
    identity.condition,
    `${identity.trial}.json`
  );
}

async function assertResultDestinationsAvailable(
  config: EvalConfig,
  manifest: EvalManifest
): Promise<void> {
  for (const mutation of manifest.mutations) {
    for (const condition of conditionIds) {
      const destination = resultDestination({
        condition,
        fixtureId: manifest.fixtureId,
        mutationId: mutation.id,
        runId: config.runId,
        trial: config.trial,
      });
      try {
        await access(destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      throw new EvalUsageError(
        `Results already exist for run ${config.runId}, mutation ${mutation.id}, condition ${condition}, trial ${config.trial}. Choose a new EVAL_RUN_ID or EVAL_TRIAL.`
      );
    }
  }
}

async function runJob(options: {
  budgetRemaining: number;
  initialComparison: ComparisonSnapshot;
  context: JobContext;
  perturbationReferences: ReadonlyMap<string, RenderedReference>;
  referencePngB64: string;
  server: EvalFixtureServer;
  workspace: RepairWorkspace;
}): Promise<EvalResult> {
  const initialFeedback = buildConditionFeedback(
    options.context.condition,
    options.initialComparison
  );
  const messages = buildInitialMessages(options.workspace, initialFeedback);
  const state = createJobState(hashMessages(messages));

  for (let turn = 1; turn <= options.context.config.maxTurns; turn += 1) {
    if (jobCostUsd(state) >= options.budgetRemaining) {
      return buildResult(options.context, state, 'aborted_budget');
    }
    let modelTurn;
    try {
      modelTurn = await requestOpenRouterTurn({
        apiKey: options.context.config.apiKey,
        messages,
        model: options.context.config.model,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const callError = error instanceof OpenRouterCallError ? error : undefined;
      state.turnRecords.push({
        costUnknown: callError?.costUnknown ?? true,
        error: message,
        ...(callError?.partialUsage ? { partialUsage: callError.partialUsage } : {}),
        requestAttempts: callError?.attempts ?? 1,
        retryDelaysMs: callError?.retryDelaysMs ?? [],
        turn,
      });
      return buildResult(options.context, state, 'error', {
        error: message,
      });
    }
    const turnRecord: EvalTurnRecord = {
      costUnknown: false,
      finishReason: modelTurn.finishReason,
      requestAttempts: modelTurn.requestAttempts,
      retryDelaysMs: modelTurn.retryDelaysMs,
      turn,
      usage: modelTurn.usage,
    };
    const costUsd = jobCostUsd(state) + modelTurn.usage.costUsd;
    if (costUsd > options.budgetRemaining) {
      state.turnRecords.push(turnRecord);
      return buildResult(options.context, state, 'aborted_budget');
    }

    messages.push({ content: modelTurn.content, role: 'assistant' });
    if (modelTurn.finishReason !== 'stop') {
      turnRecord.protocolError = `Response ended with finish reason ${modelTurn.finishReason}`;
      state.turnRecords.push(turnRecord);
      if (turn < options.context.config.maxTurns) {
        messages.push({
          content: `The response ended with finish reason ${modelTurn.finishReason}. Return one complete JSON proposal.`,
          role: 'user',
        });
        continue;
      }
      return buildResult(options.context, state, 'protocol_error');
    }

    let proposal: RepairProposal;
    try {
      proposal = parseRepairProposal(modelTurn.content);
      await options.workspace.applyProposal(proposal);
    } catch (error) {
      if (!isProposalError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        turnRecord.error = message;
        state.turnRecords.push(turnRecord);
        return buildResult(options.context, state, 'error', {
          error: message,
        });
      }
      turnRecord.protocolError = error.message;
      state.turnRecords.push(turnRecord);
      if (turn < options.context.config.maxTurns) {
        messages.push({
          content: `The proposal could not be applied: ${error.message}. Return one complete replacement proposal using the required JSON shape.`,
          role: 'user',
        });
        continue;
      }
      return buildResult(options.context, state, 'protocol_error');
    }
    turnRecord.proposal = proposal;

    let finalComparison: ComparisonSnapshot;
    try {
      finalComparison = await compareVariant({
        expectedSpec: options.context.manifest.reference.expectedSpec,
        manifest: options.context.manifest,
        purpose: 'visible',
        referencePngB64: options.referencePngB64,
        server: options.server,
        story: options.server.workspaceImplementationUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      turnRecord.error = message;
      state.turnRecords.push(turnRecord);
      return buildResult(options.context, state, 'error', {
        error: message,
      });
    }
    turnRecord.visibleComparison = finalComparison.visible;
    state.turnRecords.push(turnRecord);
    if (finalComparison.visible.pass || turn === options.context.config.maxTurns) {
      let acceptance: HiddenAcceptanceResult;
      try {
        acceptance = await evaluateFinalProposal({
          finalComparison,
          manifest: options.context.manifest,
          mutation: options.context.mutation,
          perturbationReferences: options.perturbationReferences,
          proposal,
          server: options.server,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        turnRecord.error = message;
        return buildResult(options.context, state, 'error', {
          error: message,
        });
      }
      return buildResult(options.context, state, acceptance.accepted ? 'passed' : 'repair_failed', {
        acceptance,
      });
    }

    const feedback = buildConditionFeedback(options.context.condition, finalComparison);
    messages.push({
      content: feedbackContent(
        'The proposal was applied to a fresh copy of the original current styles.css, but the visible comparison still differs. Return a complete replacement proposal.',
        feedback
      ),
      role: 'user',
    });
  }

  throw new Error('Eval job exhausted its turn loop without producing a terminal result');
}

async function runEvaluation(config: EvalConfig): Promise<void> {
  const manifest = await loadManifest();
  await assertResultDestinationsAvailable(config, manifest);
  buildCli();
  let totalKnownCostUsd = 0;
  const totalJobs = manifest.mutations.length * conditionIds.length;
  if (totalJobs === 0) throw new Error('Eval manifest does not contain any jobs');
  const jobBudgetUsd = config.commandBudgetUsd / totalJobs;
  for (const mutation of manifest.mutations) {
    const fixture = await createFixtureContext(manifest, mutation);
    try {
      const initialComparison = await compareVariant({
        expectedSpec: manifest.reference.expectedSpec,
        manifest,
        purpose: 'visible',
        referencePngB64: fixture.reference.pngB64,
        server: fixture.server,
        story: fixture.server.workspaceImplementationUrl,
      });
      if (initialComparison.visible.pass) {
        throw new Error(`Mutation ${mutation.id} does not produce a failing comparison`);
      }
      for (const condition of config.conditionOrder) {
        await fixture.workspace.reset();
        const context: JobContext = {
          condition,
          config,
          initialComparison: initialComparison.visible,
          jobBudgetUsd,
          manifest,
          mutation,
        };
        if (totalKnownCostUsd >= config.commandBudgetUsd) {
          const messages = buildInitialMessages(
            fixture.workspace,
            buildConditionFeedback(condition, initialComparison)
          );
          const result = buildResult(
            context,
            createJobState(hashMessages(messages)),
            'aborted_budget'
          );
          await writeResult(result);
          console.error(`Eval budget exhausted before ${mutation.id}/${condition}.`);
          continue;
        }
        const result = await runJob({
          budgetRemaining: Math.min(jobBudgetUsd, config.commandBudgetUsd - totalKnownCostUsd),
          context,
          initialComparison,
          perturbationReferences: fixture.perturbationReferences,
          referencePngB64: fixture.reference.pngB64,
          server: fixture.server,
          workspace: fixture.workspace,
        });
        totalKnownCostUsd += result.knownCostUsd;
        await writeResult(result);
        console.log(
          `${mutation.id}/${condition}: ${result.status}, turns=${result.turns}, knownCost=$${result.knownCostUsd.toFixed(6)}${result.costUnknown ? '+' : ''}`
        );
        if (result.costUnknown) {
          throw new Error(
            `OpenRouter cost is unknown for ${mutation.id}/${condition}; the result was saved and the run stopped before another paid request.`
          );
        }
      }
    } finally {
      await fixture.close();
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-check') {
    await runSelfCheck();
    return;
  }
  if (args.length !== 0) {
    throw new EvalUsageError('Usage: pnpm eval:run or pnpm eval:smoke');
  }
  const config = loadEvalConfig();
  await runEvaluation(config);
}

main().catch((error: unknown) => {
  if (error instanceof EvalUsageError) {
    console.error(`Eval configuration error: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
