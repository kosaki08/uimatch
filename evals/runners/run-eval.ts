import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { access, link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildFlatDiffFeedback } from '../conditions/flat-diff.js';
import { buildRenderOnlyFeedback } from '../conditions/render-only.js';
import { buildScalarFeedback } from '../conditions/scalar.js';
import { compareVariant, createFixtureContext, evaluateFinalProposal } from '../harness.js';
import { evalRoot, loadManifest } from '../manifest.js';
import type { RepairWorkspace } from '../repair-workspace.js';
import {
  conditionIds,
  evalIdentifierPattern,
  type ComparisonSnapshot,
  type ConditionFeedback,
  type ConditionId,
  type EvalManifest,
  type EvalMutation,
  type EvalResult,
  type EvalStatus,
  type HiddenAcceptanceResult,
  type ModelTurnUsage,
  type RepairChange,
  type RepairProposal,
} from '../types.js';
import { buildCli, EvalUsageError } from './build-cli.js';
import type { EvalFixtureServer } from './fixture-server.js';
import { requestOpenRouterTurn, type ModelMessage, type ModelTurn } from './openrouter.js';
import { runSelfCheck } from './self-check.js';

interface EvalConfig {
  apiKey: string;
  budgetUsd: number;
  maxTurns: number;
  model: string;
  runId: string;
  trial: number;
  uimatchCommit: string;
}

interface JobContext {
  condition: ConditionId;
  config: EvalConfig;
  manifest: EvalManifest;
  mutation: EvalMutation;
}

interface JobState {
  costUsd: number;
  promptHash: string;
  proposals: RepairProposal[];
  protocolErrors: number;
  tokensUsed: number;
  turns: number;
  turnUsage: ModelTurnUsage[];
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
  return {
    apiKey: requireEnvironment('OPENROUTER_API_KEY'),
    budgetUsd: parsePositiveNumber('EVAL_BUDGET_USD'),
    maxTurns: parsePositiveIntegerValue('EVAL_MAX_TURNS', requireEnvironment('EVAL_MAX_TURNS')),
    model: requireEnvironment('EVAL_MODEL'),
    runId: parseRunId(),
    trial: trialValue ? parsePositiveIntegerValue('EVAL_TRIAL', trialValue) : 1,
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
    case 'render-only':
      return buildRenderOnlyFeedback(comparison);
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
    costUsd: 0,
    promptHash,
    proposals: [],
    protocolErrors: 0,
    tokensUsed: 0,
    turns: 0,
    turnUsage: [],
  };
}

function buildResult(
  context: JobContext,
  state: JobState,
  status: EvalStatus,
  extras: { acceptance?: HiddenAcceptanceResult; error?: string } = {}
): EvalResult {
  return {
    ...(extras.acceptance ? { acceptance: extras.acceptance } : {}),
    condition: context.condition,
    costUsd: state.costUsd,
    ...(extras.error ? { error: extras.error } : {}),
    fixtureId: context.manifest.fixtureId,
    model: context.config.model,
    mutationId: context.mutation.id,
    promptHash: state.promptHash,
    proposals: state.proposals,
    protocolErrors: state.protocolErrors,
    runId: context.config.runId,
    status,
    tokensUsed: state.tokensUsed,
    trial: context.config.trial,
    turns: state.turns,
    turnUsage: state.turnUsage,
    uimatchCommit: context.config.uimatchCommit,
  };
}

function recordModelTurn(state: JobState, turn: number, modelTurn: ModelTurn): void {
  state.costUsd += modelTurn.usage.costUsd;
  state.tokensUsed += modelTurn.usage.totalTokens;
  state.turns = turn;
  state.turnUsage.push(modelTurn.usage);
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
  perturbationReferences: ReadonlyMap<string, string>;
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
    let modelTurn: ModelTurn;
    try {
      modelTurn = await requestOpenRouterTurn({
        apiKey: options.context.config.apiKey,
        messages,
        model: options.context.config.model,
      });
    } catch (error) {
      state.turns = turn;
      return buildResult(options.context, state, 'error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    recordModelTurn(state, turn, modelTurn);
    if (state.costUsd > options.budgetRemaining) {
      return buildResult(options.context, state, 'aborted_budget');
    }

    messages.push({ content: modelTurn.content, role: 'assistant' });
    if (modelTurn.finishReason !== 'stop') {
      state.protocolErrors += 1;
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
        return buildResult(options.context, state, 'error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      state.protocolErrors += 1;
      if (turn < options.context.config.maxTurns) {
        messages.push({
          content: `The proposal could not be applied: ${error.message}. Return one complete replacement proposal using the required JSON shape.`,
          role: 'user',
        });
        continue;
      }
      return buildResult(options.context, state, 'protocol_error');
    }
    state.proposals.push(proposal);

    let finalComparison: ComparisonSnapshot;
    try {
      finalComparison = await compareVariant(
        options.context.manifest,
        options.server,
        options.server.workspaceImplementationUrl,
        options.referencePngB64,
        options.context.manifest.reference.expectedSpec
      );
    } catch (error) {
      return buildResult(options.context, state, 'error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (finalComparison.pass || turn === options.context.config.maxTurns) {
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
        return buildResult(options.context, state, 'error', {
          error: error instanceof Error ? error.message : String(error),
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

  return buildResult(options.context, state, 'repair_failed');
}

async function runEvaluation(config: EvalConfig): Promise<void> {
  const manifest = await loadManifest();
  await assertResultDestinationsAvailable(config, manifest);
  buildCli();
  let totalCostUsd = 0;
  for (const mutation of manifest.mutations) {
    const fixture = await createFixtureContext(manifest, mutation);
    try {
      const initialComparison = await compareVariant(
        manifest,
        fixture.server,
        fixture.server.workspaceImplementationUrl,
        fixture.reference.pngB64,
        manifest.reference.expectedSpec
      );
      if (initialComparison.pass) {
        throw new Error(`Mutation ${mutation.id} does not produce a failing comparison`);
      }
      for (const condition of conditionIds) {
        await fixture.workspace.reset();
        const context: JobContext = { condition, config, manifest, mutation };
        if (totalCostUsd >= config.budgetUsd) {
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
          return;
        }
        const result = await runJob({
          budgetRemaining: config.budgetUsd - totalCostUsd,
          context,
          initialComparison,
          perturbationReferences: fixture.perturbationReferences,
          referencePngB64: fixture.reference.pngB64,
          server: fixture.server,
          workspace: fixture.workspace,
        });
        totalCostUsd += result.costUsd;
        await writeResult(result);
        console.log(
          `${mutation.id}/${condition}: ${result.status}, turns=${result.turns}, cost=$${result.costUsd.toFixed(6)}`
        );
        if (result.status === 'aborted_budget') return;
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
