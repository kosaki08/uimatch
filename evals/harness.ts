import { chromium } from '@playwright/test';
import type { CompareResult } from '@uimatch/cli';
import { evaluateHiddenAcceptance } from './evaluators/hidden-acceptance.js';
import { createRepairWorkspace, type RepairWorkspace } from './repair-workspace.js';
import { startEvalFixtureServer, type EvalFixtureServer } from './runners/fixture-server.js';
import type {
  ComparisonSnapshot,
  EvalManifest,
  EvalMutation,
  ExpectedMetadata,
  HiddenAcceptanceResult,
  RepairProposal,
} from './types.js';

export interface FixtureContext {
  close(): Promise<void>;
  perturbationReferences: ReadonlyMap<string, string>;
  reference: {
    metadata: ExpectedMetadata;
    pngB64: string;
  };
  server: EvalFixtureServer;
  workspace: RepairWorkspace;
}

interface RenderedVariant {
  metadata?: ExpectedMetadata;
  pngB64: string;
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

async function renderVariant(
  manifest: EvalManifest,
  url: string,
  collectMetadata = false
): Promise<RenderedVariant> {
  const channel = process.env.UIMATCH_CHROME_CHANNEL?.trim() || undefined;
  const browser = await chromium.launch({
    ...(channel ? { channel } : {}),
    chromiumSandbox: process.env.UIMATCH_CHROMIUM_SANDBOX !== 'false',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: manifest.viewport });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.addStyleTag({
      content:
        '*{animation:none!important;transition:none!important}body{background:#fff!important}',
    });
    const locator = page.locator(manifest.selector);
    await locator.waitFor({ state: 'visible', timeout: 10_000 });
    const metadata = collectMetadata
      ? asExpectedMetadata(
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
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
                Number.parseFloat(style.paddingLeft),
              ],
              width: bounds.width,
            };
          }, manifest.selector)
        )
      : undefined;
    const png = await locator.screenshot({ animations: 'disabled', type: 'png' });
    return {
      ...(metadata ? { metadata } : {}),
      pngB64: png.toString('base64'),
    };
  } finally {
    await browser.close();
  }
}

export async function compareVariant(
  manifest: EvalManifest,
  server: EvalFixtureServer,
  story: string,
  referencePngB64: string,
  expectedSpec: EvalManifest['reference']['expectedSpec'] = {}
): Promise<ComparisonSnapshot> {
  const previousBypass = process.env.UIMATCH_FIGMA_PNG_B64;
  process.env.UIMATCH_FIGMA_PNG_B64 = referencePngB64;
  try {
    const { uiMatchCompare } = await import('@uimatch/cli');
    const result: CompareResult = await uiMatchCompare({
      contentBasis: 'intersection',
      dpr: 1,
      emitArtifacts: true,
      figma: 'eval:1-1',
      figmaScale: 1,
      fontPreload: [server.fontUrl],
      expectedSpec,
      reuseBrowser: false,
      selector: manifest.selector,
      sizeMode: 'pad',
      story,
      thresholds: { maxHighSeverityIssues: 0, pixelDiffRatio: 0.001 },
      viewport: manifest.viewport,
    });
    const artifacts = result.report.artifacts;
    if (!artifacts) throw new Error('uiMatch comparison did not return requested image artifacts');
    if (!Number.isFinite(result.report.metrics.dfs)) {
      throw new Error('uiMatch comparison returned a non-finite DFS score');
    }
    return {
      artifacts,
      metrics: { dfs: result.report.metrics.dfs },
      pass: result.report.qualityGate?.pass === true,
      styleDiffs: result.report.styleDiffs,
    };
  } finally {
    if (previousBypass === undefined) delete process.env.UIMATCH_FIGMA_PNG_B64;
    else process.env.UIMATCH_FIGMA_PNG_B64 = previousBypass;
  }
}

async function renderPerturbationReferences(
  manifest: EvalManifest,
  server: EvalFixtureServer
): Promise<ReadonlyMap<string, string>> {
  const references = new Map<string, string>();
  for (const perturbation of manifest.perturbations) {
    const url = server.perturbationReferenceUrls.get(perturbation.id);
    if (!url) throw new Error(`Fixture server omitted perturbation ${perturbation.id}`);
    references.set(perturbation.id, (await renderVariant(manifest, url)).pngB64);
  }
  return references;
}

export async function evaluateFinalProposal(options: {
  finalComparison: ComparisonSnapshot;
  manifest: EvalManifest;
  mutation: EvalMutation;
  perturbationReferences: ReadonlyMap<string, string>;
  proposal: RepairProposal;
  server: EvalFixtureServer;
}): Promise<HiddenAcceptanceResult> {
  const perturbationPasses = new Map<string, boolean>();
  for (const perturbation of options.manifest.perturbations) {
    const story = options.server.workspacePerturbationUrls.get(perturbation.id);
    const referencePngB64 = options.perturbationReferences.get(perturbation.id);
    if (!story || !referencePngB64) {
      throw new Error(`Perturbation evaluation inputs are incomplete for ${perturbation.id}`);
    }
    const comparison = await compareVariant(
      options.manifest,
      options.server,
      story,
      referencePngB64
    );
    perturbationPasses.set(perturbation.id, comparison.pass);
  }
  return evaluateHiddenAcceptance(options.manifest, options.mutation, options.proposal, {
    finalComparisonPassed: options.finalComparison.pass,
    perturbationPasses,
  });
}

export async function createFixtureContext(
  manifest: EvalManifest,
  mutation: EvalMutation
): Promise<FixtureContext> {
  const workspace = await createRepairWorkspace(manifest, mutation);
  let server: EvalFixtureServer | undefined;
  try {
    server = await startEvalFixtureServer(manifest, workspace);
    const reference = await renderVariant(manifest, server.referenceUrl, true);
    if (!reference.metadata) throw new Error('Reference metadata was not captured');
    const perturbationReferences = await renderPerturbationReferences(manifest, server);
    const activeServer = server;
    return {
      async close(): Promise<void> {
        const cleanup = await Promise.allSettled([activeServer.close(), workspace.close()]);
        const failures = cleanup.filter((result) => result.status === 'rejected');
        if (failures.length > 0) {
          throw new AggregateError(
            failures.map((failure) => {
              const reason: unknown = failure.reason;
              return reason instanceof Error ? reason : new Error(String(reason));
            }),
            'Eval fixture cleanup failed'
          );
        }
      },
      perturbationReferences,
      reference: { metadata: reference.metadata, pngB64: reference.pngB64 },
      server: activeServer,
      workspace,
    };
  } catch (error) {
    await Promise.allSettled([server?.close(), workspace.close()]);
    throw error;
  }
}
