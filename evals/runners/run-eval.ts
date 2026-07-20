import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { access, link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { TurnBackendError, type ModelMessage, type TurnBackend } from '../backends/backend.js';
import { createCodexExecBackend } from '../backends/codex-exec.js';
import { createOpenRouterBackend } from '../backends/openrouter.js';
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
import { parseRepairProposalJson } from '../repair-proposal.js';
import type { RepairWorkspace } from '../repair-workspace.js';
import {
  conditionIds,
  conditionOrderForTrial,
  evalIdentifierPattern,
  type ComparisonSnapshot,
  type ConditionFeedback,
  type ConditionId,
  type EvalBudget,
  type EvalManifest,
  type EvalMutation,
  type EvalResult,
  type EvalStatus,
  type EvalTurnRecord,
  type HiddenAcceptanceResult,
  type RepairProposal,
  type VisibleComparisonMetrics,
} from '../types.js';
import { buildCli, EvalUsageError } from './build-cli.js';
import type { EvalFixtureServer } from './fixture-server.js';
import { runSelfCheck } from './self-check.js';

interface EvalConfig {
  backend: TurnBackend;
  budget: { commandBudgetUsd: number; mode: 'metered-usd' } | { mode: 'subscription' };
  conditionOrder: ConditionId[];
  maxTurns: number;
  model: string;
  runId: string;
  trial: number;
  uimatchCommit: string;
}

interface JobContext {
  budget: EvalBudget;
  condition: ConditionId;
  config: EvalConfig;
  initialComparison: VisibleComparisonMetrics;
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

async function loadEvalConfig(): Promise<EvalConfig> {
  const trialValue = process.env.EVAL_TRIAL?.trim();
  const trial = trialValue ? parsePositiveIntegerValue('EVAL_TRIAL', trialValue) : 1;
  const backendId = requireEnvironment('EVAL_BACKEND');
  const authMode = requireEnvironment('EVAL_AUTH_MODE');
  const maxTurns = parsePositiveIntegerValue(
    'EVAL_MAX_TURNS',
    requireEnvironment('EVAL_MAX_TURNS')
  );
  const model = requireEnvironment('EVAL_MODEL');
  const runId = parseRunId();
  const uimatchCommit = requireEnvironment('UIMATCH_EVAL_COMMIT');
  let backend: TurnBackend;
  let budget: EvalConfig['budget'];
  if (backendId === 'openrouter' && authMode === 'api') {
    backend = createOpenRouterBackend(requireEnvironment('OPENROUTER_API_KEY'));
    budget = { commandBudgetUsd: parsePositiveNumber('EVAL_BUDGET_USD'), mode: 'metered-usd' };
  } else if (backendId === 'codex-exec' && authMode === 'subscription') {
    backend = await createCodexExecBackend();
    budget = { mode: 'subscription' };
  } else {
    throw new EvalUsageError(
      'EVAL_BACKEND/EVAL_AUTH_MODE must be openrouter/api or codex-exec/subscription.'
    );
  }
  return {
    backend,
    budget,
    conditionOrder: conditionOrderForTrial(trial),
    maxTurns,
    model,
    runId,
    trial,
    uimatchCommit,
  };
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
  return state.turnRecords.flatMap((record) => (record.usage ? [record.usage] : []));
}

function jobCostUsd(state: JobState): number {
  return state.turnRecords.reduce(
    (sum, record) =>
      sum + (record.billing.mode === 'metered-usd' ? record.billing.knownCostUsd : 0),
    0
  );
}

function aggregateBilling(state: JobState, budget: EvalConfig['budget']) {
  if (budget.mode === 'subscription') return { mode: 'subscription' as const };
  return {
    costUnknown: state.turnRecords.some(
      (record) => record.billing.mode === 'metered-usd' && record.billing.costUnknown
    ),
    knownCostUsd: jobCostUsd(state),
    mode: 'metered-usd' as const,
  };
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
    authMode: context.config.backend.authMode,
    backend: context.config.backend.id,
    backendVersion: context.config.backend.version,
    billing: aggregateBilling(state, context.config.budget),
    budget: context.budget,
    condition: context.condition,
    conditionOrder: context.config.conditionOrder,
    ...(extras.error ? { error: extras.error } : {}),
    ...(finalComparison ? { finalComparison } : {}),
    fixtureId: context.manifest.fixtureId,
    initialComparison: context.initialComparison,
    maxTurns: context.config.maxTurns,
    model: context.config.model,
    mutationId: context.mutation.id,
    promptHash: state.promptHash,
    protocolErrors: state.turnRecords.filter((record) => record.protocolError !== undefined).length,
    runId: context.config.runId,
    schemaVersion: 3,
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
  budgetRemaining?: number;
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
    if (options.budgetRemaining !== undefined && jobCostUsd(state) >= options.budgetRemaining) {
      return buildResult(options.context, state, 'aborted_budget');
    }
    let modelTurn;
    try {
      modelTurn = await options.context.config.backend.runTurn({
        messages,
        model: options.context.config.model,
        workspacePath: dirname(options.workspace.agentInput.htmlPath),
      });
    } catch (error) {
      if (!(error instanceof TurnBackendError)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      state.turnRecords.push({
        billing: error.billing,
        error: message,
        requestAttempts: error.attempts,
        retryDelaysMs: error.retryDelaysMs,
        turn,
        ...(error.usage ? { usage: error.usage } : {}),
      });
      return buildResult(options.context, state, 'error', {
        error: message,
      });
    }
    const turnRecord: EvalTurnRecord = {
      billing: modelTurn.billing,
      finishReason: modelTurn.finishReason,
      requestAttempts: modelTurn.requestAttempts,
      retryDelaysMs: modelTurn.retryDelaysMs,
      turn,
      usage: modelTurn.usage,
    };
    const costUsd =
      jobCostUsd(state) +
      (modelTurn.billing.mode === 'metered-usd' ? modelTurn.billing.knownCostUsd : 0);
    if (options.budgetRemaining !== undefined && costUsd > options.budgetRemaining) {
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
      proposal = parseRepairProposalJson(modelTurn.content, 'model response');
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
  const jobBudgetUsd =
    config.budget.mode === 'metered-usd' ? config.budget.commandBudgetUsd / totalJobs : undefined;
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
          budget:
            config.budget.mode === 'metered-usd' && jobBudgetUsd !== undefined
              ? {
                  commandBudgetUsd: config.budget.commandBudgetUsd,
                  jobBudgetUsd,
                  mode: 'metered-usd',
                }
              : { mode: 'subscription' },
          condition,
          config,
          initialComparison: initialComparison.visible,
          manifest,
          mutation,
        };
        if (
          config.budget.mode === 'metered-usd' &&
          totalKnownCostUsd >= config.budget.commandBudgetUsd
        ) {
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
          ...(config.budget.mode === 'metered-usd' && jobBudgetUsd !== undefined
            ? {
                budgetRemaining: Math.min(
                  jobBudgetUsd,
                  config.budget.commandBudgetUsd - totalKnownCostUsd
                ),
              }
            : {}),
          context,
          initialComparison,
          perturbationReferences: fixture.perturbationReferences,
          referencePngB64: fixture.reference.pngB64,
          server: fixture.server,
          workspace: fixture.workspace,
        });
        if (result.billing.mode === 'metered-usd') {
          totalKnownCostUsd += result.billing.knownCostUsd;
        }
        await writeResult(result);
        const billingSummary =
          result.billing.mode === 'subscription'
            ? 'billing=subscription'
            : `knownCost=$${result.billing.knownCostUsd.toFixed(6)}${result.billing.costUnknown ? '+' : ''}`;
        console.log(
          `${mutation.id}/${condition}: ${result.status}, turns=${result.turns}, ${billingSummary}`
        );
        if (result.billing.mode === 'metered-usd' && result.billing.costUnknown) {
          throw new Error(
            `Metered backend cost is unknown for ${mutation.id}/${condition}; the result was saved and the run stopped before another paid request.`
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
  const config = await loadEvalConfig();
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
