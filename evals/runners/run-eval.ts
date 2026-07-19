import 'dotenv/config';

import { chromium } from '@playwright/test';
import type { CompareResult } from '@uimatch/cli';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFlatDiffFeedback } from '../conditions/flat-diff.js';
import { buildRenderOnlyFeedback } from '../conditions/render-only.js';
import { buildScalarFeedback } from '../conditions/scalar.js';
import { evaluateHiddenAcceptance } from '../evaluators/hidden-acceptance.js';
import { evalRoot, loadManifest, resolveEvalPath } from '../manifest.js';
import {
  conditionIds,
  type ComparisonSnapshot,
  type ConditionFeedback,
  type ConditionId,
  type EvalManifest,
  type EvalMutation,
  type EvalResult,
  type ExpectedMetadata,
  type RepairChange,
  type RepairProposal,
} from '../types.js';
import { startEvalFixtureServer, type EvalFixtureServer } from './fixture-server.js';

const openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
const modelRequestTimeoutMs = 120_000;

class EvalUsageError extends Error {}

interface EvalConfig {
  apiKey: string;
  budgetUsd: number;
  maxTurns: number;
  model: string;
  uimatchCommit: string;
}

interface ModelMessage {
  content:
    | string
    | Array<{ text: string; type: 'text' } | { image_url: { url: string }; type: 'image_url' }>;
  role: 'assistant' | 'system' | 'user';
}

interface ModelTurn {
  content: string;
  costUsd: number;
  tokensUsed: number;
}

interface RenderedReference {
  metadata: ExpectedMetadata;
  pngB64: string;
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new EvalUsageError(`${name} is required. See evals/README.md.`);
  return value;
}

function parsePositiveInteger(name: string): number {
  const raw = requireEnvironment(name);
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

function loadEvalConfig(): EvalConfig {
  return {
    apiKey: requireEnvironment('OPENROUTER_API_KEY'),
    budgetUsd: parsePositiveNumber('EVAL_BUDGET_USD'),
    maxTurns: parsePositiveInteger('EVAL_MAX_TURNS'),
    model: requireEnvironment('EVAL_MODEL'),
    uimatchCommit: requireEnvironment('UIMATCH_EVAL_COMMIT'),
  };
}

function buildCli(): void {
  const pnpmEntrypoint = process.env.npm_execpath;
  if (!pnpmEntrypoint) {
    throw new EvalUsageError('Run eval commands through pnpm.');
  }
  const result = spawnSync(process.execPath, [pnpmEntrypoint, 'run', 'build'], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm run build failed with exit code ${result.status ?? 1}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
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

function asExpectedMetadata(value: unknown): ExpectedMetadata {
  const record = asRecord(value, 'rendered reference metadata');
  if (!Array.isArray(record.padding) || record.padding.length !== 4) {
    throw new TypeError('rendered reference metadata.padding must contain four values');
  }
  return {
    childCount: asNonNegativeInteger(record.childCount, 'rendered reference metadata.childCount'),
    height: asNonNegativeNumber(record.height, 'rendered reference metadata.height'),
    padding: [
      asNonNegativeNumber(record.padding[0], 'rendered reference metadata.padding[0]'),
      asNonNegativeNumber(record.padding[1], 'rendered reference metadata.padding[1]'),
      asNonNegativeNumber(record.padding[2], 'rendered reference metadata.padding[2]'),
      asNonNegativeNumber(record.padding[3], 'rendered reference metadata.padding[3]'),
    ],
    width: asNonNegativeNumber(record.width, 'rendered reference metadata.width'),
  };
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

async function renderReference(
  manifest: EvalManifest,
  server: EvalFixtureServer
): Promise<RenderedReference> {
  const channel = process.env.UIMATCH_CHROME_CHANNEL?.trim() || undefined;
  const browser = await chromium.launch({
    ...(channel ? { channel } : {}),
    chromiumSandbox: process.env.UIMATCH_CHROMIUM_SANDBOX !== 'false',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: manifest.viewport });
    await page.goto(server.referenceUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.evaluate('document.fonts.ready');
    await page.addStyleTag({
      content:
        '*{animation:none!important;transition:none!important}body{background:#fff!important}',
    });
    const locator = page.locator(manifest.selector);
    await locator.waitFor({ state: 'visible', timeout: 10_000 });
    const selector = JSON.stringify(manifest.selector);
    const metadataValue: unknown = await page.evaluate(`(() => {
      const element = document.querySelector(${selector});
      if (!element) throw new Error('Reference selector was not found');
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        childCount: element.children.length,
        height: bounds.height,
        padding: [
          Number.parseFloat(style.paddingTop),
          Number.parseFloat(style.paddingRight),
          Number.parseFloat(style.paddingBottom),
          Number.parseFloat(style.paddingLeft)
        ],
        width: bounds.width
      };
    })()`);
    const metadata = asExpectedMetadata(metadataValue);
    const png = await locator.screenshot({ animations: 'disabled', type: 'png' });
    return { metadata, pngB64: png.toString('base64') };
  } finally {
    await browser.close();
  }
}

function snapshotFromResult(result: CompareResult): ComparisonSnapshot {
  const artifacts = result.report.artifacts;
  if (!artifacts) throw new Error('uiMatch comparison did not return requested image artifacts');
  return {
    artifacts,
    metrics: { dfs: result.report.metrics.dfs },
    styleDiffs: result.report.styleDiffs,
  };
}

async function compareVariant(
  manifest: EvalManifest,
  server: EvalFixtureServer,
  story: string,
  referencePngB64: string
): Promise<CompareResult> {
  const previousBypass = process.env.UIMATCH_FIGMA_PNG_B64;
  process.env.UIMATCH_FIGMA_PNG_B64 = referencePngB64;
  try {
    const { uiMatchCompare } = await import('@uimatch/cli');
    return await uiMatchCompare({
      contentBasis: 'intersection',
      dpr: 1,
      emitArtifacts: true,
      figma: 'eval:1-1',
      figmaScale: 1,
      fontPreload: [server.fontUrl],
      expectedSpec: manifest.reference.expectedSpec,
      reuseBrowser: false,
      selector: manifest.selector,
      sizeMode: 'pad',
      story,
      thresholds: { maxHighSeverityIssues: 0, pixelDiffRatio: 0.001 },
      viewport: manifest.viewport,
    });
  } finally {
    if (previousBypass === undefined) delete process.env.UIMATCH_FIGMA_PNG_B64;
    else process.env.UIMATCH_FIGMA_PNG_B64 = previousBypass;
  }
}

function metadataMatches(actual: ExpectedMetadata, expected: ExpectedMetadata): boolean {
  return (
    actual.childCount === expected.childCount &&
    actual.height === expected.height &&
    actual.width === expected.width &&
    actual.padding.every((value, index) => value === expected.padding[index])
  );
}

async function runSelfCheck(): Promise<void> {
  buildCli();
  const manifest = await loadManifest();
  const server = await startEvalFixtureServer(manifest);
  try {
    const reference = await renderReference(manifest, server);
    if (!metadataMatches(reference.metadata, manifest.reference.expectedMetadata)) {
      throw new Error(
        `Reference metadata does not match manifest: ${JSON.stringify(reference.metadata)}`
      );
    }
    const result = await compareVariant(manifest, server, server.referenceUrl, reference.pngB64);
    if (!result.report.qualityGate?.pass) {
      throw new Error(`Reference self-comparison failed: ${result.summary}`);
    }
    if (result.report.styleDiffs.length !== 0) {
      throw new Error(
        `Reference self-comparison unexpectedly returned style differences: ${JSON.stringify(result.report.styleDiffs)}`
      );
    }
    if (!Number.isFinite(result.report.metrics.dfs)) {
      throw new Error('Reference self-comparison returned a non-finite DFS score');
    }
    const mutation = manifest.mutations[0];
    const acceptedRepair = mutation?.rootCause.acceptedRepairs[0];
    if (!mutation || !acceptedRepair) {
      throw new Error('Eval self-check requires one mutation with an accepted repair');
    }
    const accepted = evaluateHiddenAcceptance(manifest, mutation, {
      changes: acceptedRepair,
      diagnosis: 'self-check',
    });
    if (
      !accepted.accepted ||
      accepted.perturbationsSurvived.length !== manifest.perturbations.length
    ) {
      throw new Error('Hidden acceptance rejected the manifest ground truth');
    }
    const repairWithSymptomPatch = evaluateHiddenAcceptance(manifest, mutation, {
      changes: [
        ...acceptedRepair,
        { property: 'width', selector: manifest.selector, value: '96px' },
      ],
      diagnosis: 'self-check repair with symptom patch',
    });
    if (
      repairWithSymptomPatch.accepted ||
      !repairWithSymptomPatch.rootCauseRepaired ||
      repairWithSymptomPatch.symptomPatchCount !== 1
    ) {
      throw new Error('Hidden acceptance did not reject a repair with an extra symptom patch');
    }
    for (const [perturbationId, url] of server.perturbationUrls) {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) {
        throw new Error(`Perturbation ${perturbationId} was not served: HTTP ${response.status}`);
      }
    }
    console.log(`Eval self-check passed: ${manifest.fixtureId}, DFS ${result.report.metrics.dfs}`);
  } finally {
    await server.close();
  }
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

async function requestModelTurn(config: EvalConfig, messages: ModelMessage[]): Promise<ModelTurn> {
  const response = await fetch(openRouterEndpoint, {
    body: JSON.stringify({
      max_tokens: 800,
      messages,
      model: config.model,
      stream: false,
      temperature: 0,
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(modelRequestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter request failed with HTTP ${response.status}`);
  }

  const body: unknown = await response.json();
  const record = asRecord(body, 'OpenRouter response');
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new TypeError('OpenRouter response choices must be a non-empty array');
  }
  const choice = asRecord(choices[0], 'OpenRouter response choices[0]');
  const finishReason = asString(
    choice.finish_reason,
    'OpenRouter response choices[0].finish_reason'
  );
  if (finishReason !== 'stop') {
    throw new Error(`OpenRouter response ended with finish reason ${finishReason}`);
  }
  const message = asRecord(choice.message, 'OpenRouter response choices[0].message');
  const usage = asRecord(record.usage, 'OpenRouter response usage');
  return {
    content: asString(message.content, 'OpenRouter response message.content'),
    costUsd: asNonNegativeNumber(usage.cost, 'OpenRouter response usage.cost'),
    tokensUsed: asNonNegativeInteger(usage.total_tokens, 'OpenRouter response usage.total_tokens'),
  };
}

async function buildInitialMessages(
  manifest: EvalManifest,
  mutation: EvalMutation,
  feedback: ConditionFeedback
): Promise<ModelMessage[]> {
  const [baseCss, mutationHtml, mutationCss] = await Promise.all([
    readFile(resolve(evalRoot, 'fixtures', manifest.fixtureId, 'base.css'), 'utf8'),
    readFile(resolveEvalPath(mutation.html), 'utf8'),
    readFile(resolveEvalPath(mutation.css), 'utf8'),
  ]);
  const prompt = [
    'Repair the mutated UI at its root cause with the smallest CSS change.',
    'Do not patch symptoms such as width, margin, position, or transforms.',
    feedback.text,
    'Return JSON only with this shape:',
    '{"diagnosis":"...","changes":[{"selector":"...","property":"...","value":"..."}]}',
    'base.css:',
    baseCss,
    'mutation index.html:',
    mutationHtml,
    'mutation styles.css:',
    mutationCss,
  ].join('\n\n');
  const userContent: Extract<ModelMessage['content'], unknown[]> = [{ text: prompt, type: 'text' }];
  for (const image of feedback.images) {
    userContent.push({ text: image.label, type: 'text' });
    userContent.push({ image_url: { url: image.dataUrl }, type: 'image_url' });
  }
  return [
    {
      content:
        'You repair HTML and CSS from visual comparison feedback. Return the requested JSON and no Markdown.',
      role: 'system',
    },
    { content: userContent, role: 'user' },
  ];
}

async function writeResult(result: EvalResult): Promise<void> {
  const resultsDirectory = resolve(evalRoot, 'results');
  await mkdir(resultsDirectory, { recursive: true });
  const name = `${result.fixtureId}--${result.mutationId}--${result.condition}.json`;
  const destination = resolve(resultsDirectory, name);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
}

async function runJob(options: {
  budgetRemaining: number;
  comparison: ComparisonSnapshot;
  condition: ConditionId;
  config: EvalConfig;
  manifest: EvalManifest;
  mutation: EvalMutation;
}): Promise<EvalResult> {
  const feedback = buildConditionFeedback(options.condition, options.comparison);
  const messages = await buildInitialMessages(options.manifest, options.mutation, feedback);
  const promptHash = createHash('sha256').update(JSON.stringify(messages)).digest('hex');
  const proposals: RepairProposal[] = [];
  let costUsd = 0;
  let tokensUsed = 0;
  let lastAcceptance: EvalResult['acceptance'];

  for (let turn = 1; turn <= options.config.maxTurns; turn += 1) {
    let modelTurn: ModelTurn;
    try {
      modelTurn = await requestModelTurn(options.config, messages);
    } catch (error) {
      return {
        condition: options.condition,
        costUsd,
        error: error instanceof Error ? error.message : String(error),
        fixtureId: options.manifest.fixtureId,
        model: options.config.model,
        mutationId: options.mutation.id,
        promptHash,
        proposals,
        status: 'error',
        tokensUsed,
        turns: turn,
        uimatchCommit: options.config.uimatchCommit,
      };
    }
    costUsd += modelTurn.costUsd;
    tokensUsed += modelTurn.tokensUsed;
    if (costUsd > options.budgetRemaining) {
      return {
        condition: options.condition,
        costUsd,
        fixtureId: options.manifest.fixtureId,
        model: options.config.model,
        mutationId: options.mutation.id,
        promptHash,
        status: 'aborted_budget',
        tokensUsed,
        turns: turn,
        uimatchCommit: options.config.uimatchCommit,
        proposals,
      };
    }

    messages.push({ content: modelTurn.content, role: 'assistant' });
    try {
      const proposal = parseRepairProposal(modelTurn.content);
      proposals.push(proposal);
      lastAcceptance = evaluateHiddenAcceptance(options.manifest, options.mutation, proposal);
      if (lastAcceptance.accepted) {
        return {
          acceptance: lastAcceptance,
          condition: options.condition,
          costUsd,
          fixtureId: options.manifest.fixtureId,
          model: options.config.model,
          mutationId: options.mutation.id,
          promptHash,
          proposals,
          status: 'passed',
          tokensUsed,
          turns: turn,
          uimatchCommit: options.config.uimatchCommit,
        };
      }
    } catch (error) {
      if (
        !(error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError)
      ) {
        throw error;
      }
    }
    messages.push({
      content:
        'The hidden evaluator rejected that response. Return a revised repair using the same JSON shape only.',
      role: 'user',
    });
  }

  return {
    ...(lastAcceptance ? { acceptance: lastAcceptance } : {}),
    condition: options.condition,
    costUsd,
    fixtureId: options.manifest.fixtureId,
    model: options.config.model,
    mutationId: options.mutation.id,
    promptHash,
    proposals,
    status: 'failed',
    tokensUsed,
    turns: options.config.maxTurns,
    uimatchCommit: options.config.uimatchCommit,
  };
}

async function runEvaluation(config: EvalConfig): Promise<void> {
  buildCli();
  const manifest = await loadManifest();
  const server = await startEvalFixtureServer(manifest);
  let totalCostUsd = 0;
  try {
    const reference = await renderReference(manifest, server);
    for (const mutation of manifest.mutations) {
      const mutationUrl = server.mutationUrls.get(mutation.id);
      if (!mutationUrl) throw new Error(`Fixture server omitted mutation ${mutation.id}`);
      const comparison = snapshotFromResult(
        await compareVariant(manifest, server, mutationUrl, reference.pngB64)
      );
      for (const condition of conditionIds) {
        if (totalCostUsd >= config.budgetUsd) {
          const result: EvalResult = {
            condition,
            costUsd: 0,
            fixtureId: manifest.fixtureId,
            model: config.model,
            mutationId: mutation.id,
            promptHash: createHash('sha256')
              .update(`${manifest.fixtureId}:${mutation.id}:${condition}`)
              .digest('hex'),
            status: 'aborted_budget',
            tokensUsed: 0,
            turns: 0,
            uimatchCommit: config.uimatchCommit,
          };
          await writeResult(result);
          console.error(`Eval budget exhausted before ${mutation.id}/${condition}.`);
          return;
        }
        let result: EvalResult;
        try {
          result = await runJob({
            budgetRemaining: config.budgetUsd - totalCostUsd,
            comparison,
            condition,
            config,
            manifest,
            mutation,
          });
        } catch (error) {
          result = {
            condition,
            costUsd: 0,
            error: error instanceof Error ? error.message : String(error),
            fixtureId: manifest.fixtureId,
            model: config.model,
            mutationId: mutation.id,
            promptHash: createHash('sha256')
              .update(`${manifest.fixtureId}:${mutation.id}:${condition}:error`)
              .digest('hex'),
            status: 'error',
            tokensUsed: 0,
            turns: 0,
            uimatchCommit: config.uimatchCommit,
          };
          await writeResult(result);
          throw error;
        }
        totalCostUsd += result.costUsd;
        await writeResult(result);
        console.log(
          `${mutation.id}/${condition}: ${result.status}, turns=${result.turns}, cost=$${result.costUsd.toFixed(6)}`
        );
        if (result.status === 'aborted_budget') return;
      }
    }
  } finally {
    await server.close();
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
