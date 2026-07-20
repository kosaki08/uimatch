import { chromium } from '@playwright/test';
import type { CompareResult } from '@uimatch/cli';
import { evaluateHiddenAcceptance } from './evaluators/hidden-acceptance.js';
import { createRepairWorkspace, type RepairWorkspace } from './repair-workspace.js';
import { startEvalFixtureServer, type EvalFixtureServer } from './runners/fixture-server.js';
import {
  expectedMetadataMatches,
  type ComparisonSnapshot,
  type EvalManifest,
  type EvalMutation,
  type EvalPerturbation,
  type ExpectedMetadata,
  type HiddenAcceptanceResult,
  type HiddenPerturbationOutcome,
  type RepairProposal,
  type VisibleComparisonMetrics,
} from './types.js';

export interface FixtureContext {
  close(): Promise<void>;
  perturbationReferences: ReadonlyMap<string, RenderedReference>;
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

export interface RenderedReference {
  metadata: ExpectedMetadata;
  pngB64: string;
}

export interface PerturbationReplay {
  comparison: ComparisonSnapshot;
  metadata: ExpectedMetadata;
}

type CompareVariantOptions = {
  manifest: EvalManifest;
  referencePngB64: string;
  server: EvalFixtureServer;
  story: string;
} & (
  | {
      expectedSpec: EvalManifest['reference']['expectedSpec'];
      purpose: 'visible';
    }
  | { purpose: 'hidden' }
);

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

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean`);
  }
  return value;
}

function asExpectedMetadata(value: unknown): ExpectedMetadata {
  const record = asRecord(value, 'rendered reference metadata');
  if (!Array.isArray(record.padding) || record.padding.length !== 4) {
    throw new TypeError('rendered reference metadata.padding must contain four values');
  }
  return {
    childCount: asNonNegativeInteger(record.childCount, 'rendered reference metadata.childCount'),
    height: asNonNegativeNumber(record.height, 'rendered reference metadata.height'),
    overflowing: asBoolean(record.overflowing, 'rendered reference metadata.overflowing'),
    padding: [
      asNonNegativeNumber(record.padding[0], 'rendered reference metadata.padding[0]'),
      asNonNegativeNumber(record.padding[1], 'rendered reference metadata.padding[1]'),
      asNonNegativeNumber(record.padding[2], 'rendered reference metadata.padding[2]'),
      asNonNegativeNumber(record.padding[3], 'rendered reference metadata.padding[3]'),
    ],
    scrollHeight: asNonNegativeNumber(
      record.scrollHeight,
      'rendered reference metadata.scrollHeight'
    ),
    scrollWidth: asNonNegativeNumber(record.scrollWidth, 'rendered reference metadata.scrollWidth'),
    width: asNonNegativeNumber(record.width, 'rendered reference metadata.width'),
  };
}

function assertMetadataMatches(
  actual: ExpectedMetadata,
  expected: ExpectedMetadata,
  label: string
): void {
  if (!expectedMetadataMatches(actual, expected)) {
    throw new Error(
      `${label} metadata does not match the manifest: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`
    );
  }
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
              overflowing:
                element.scrollWidth > element.clientWidth ||
                element.scrollHeight > element.clientHeight,
              padding: [
                Number.parseFloat(style.paddingTop),
                Number.parseFloat(style.paddingRight),
                Number.parseFloat(style.paddingBottom),
                Number.parseFloat(style.paddingLeft),
              ],
              scrollHeight: element.scrollHeight,
              scrollWidth: element.scrollWidth,
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

export async function compareVariant(options: CompareVariantOptions): Promise<ComparisonSnapshot> {
  const previousBypass = process.env.UIMATCH_FIGMA_PNG_B64;
  process.env.UIMATCH_FIGMA_PNG_B64 = options.referencePngB64;
  try {
    const { uiMatchCompare } = await import('@uimatch/cli');
    const result: CompareResult = await uiMatchCompare({
      contentBasis: options.purpose === 'hidden' ? 'union' : 'intersection',
      dpr: 1,
      emitArtifacts: true,
      figma: 'eval:1-1',
      figmaScale: 1,
      fontPreload: [options.server.fontUrl],
      expectedSpec: options.purpose === 'visible' ? options.expectedSpec : {},
      reuseBrowser: false,
      selector: options.manifest.selector,
      sizeMode: 'pad',
      story: options.story,
      thresholds: { maxHighSeverityIssues: 0, pixelDiffRatio: 0.001 },
      viewport: options.manifest.viewport,
    });
    const artifacts = result.report.artifacts;
    if (!artifacts) throw new Error('uiMatch comparison did not return requested image artifacts');
    const metrics = result.report.metrics;
    const dimensions = result.report.dimensions;
    const visible: VisibleComparisonMetrics = {
      dfs: asNonNegativeNumber(metrics.dfs, 'uiMatch comparison DFS score'),
      highSeverityIssues: result.report.styleDiffs.filter((diff) => diff.severity === 'high')
        .length,
      pass: result.report.qualityGate?.pass === true,
      pixelDiffRatio: asNonNegativeNumber(
        metrics.pixelDiffRatio,
        'uiMatch comparison pixelDiffRatio'
      ),
      ...(metrics.pixelDiffRatioContent === undefined
        ? {}
        : {
            pixelDiffRatioContent: asNonNegativeNumber(
              metrics.pixelDiffRatioContent,
              'uiMatch comparison pixelDiffRatioContent'
            ),
          }),
      styleDiffCount: result.report.styleDiffs.length,
    };
    return {
      artifacts,
      ...(dimensions
        ? {
            dimensions: {
              figma: {
                height: asNonNegativeNumber(dimensions.figma.height, 'Figma image height'),
                width: asNonNegativeNumber(dimensions.figma.width, 'Figma image width'),
              },
              impl: {
                height: asNonNegativeNumber(dimensions.impl.height, 'implementation image height'),
                width: asNonNegativeNumber(dimensions.impl.width, 'implementation image width'),
              },
            },
          }
        : {}),
      styleDiffs: result.report.styleDiffs,
      visible,
    };
  } finally {
    if (previousBypass === undefined) delete process.env.UIMATCH_FIGMA_PNG_B64;
    else process.env.UIMATCH_FIGMA_PNG_B64 = previousBypass;
  }
}

async function renderPerturbationReferences(
  manifest: EvalManifest,
  server: EvalFixtureServer
): Promise<ReadonlyMap<string, RenderedReference>> {
  const references = new Map<string, RenderedReference>();
  for (const perturbation of manifest.perturbations) {
    const url = server.perturbationReferenceUrls.get(perturbation.id);
    if (!url) throw new Error(`Fixture server omitted perturbation ${perturbation.id}`);
    const rendered = await renderVariant(manifest, url, true);
    if (!rendered.metadata) {
      throw new Error(`Perturbation ${perturbation.id} metadata was not captured`);
    }
    assertMetadataMatches(
      rendered.metadata,
      perturbation.expectedMetadata,
      `Perturbation ${perturbation.id} reference`
    );
    references.set(perturbation.id, {
      metadata: rendered.metadata,
      pngB64: rendered.pngB64,
    });
  }
  return references;
}

export async function evaluateFinalProposal(options: {
  finalComparison: ComparisonSnapshot;
  manifest: EvalManifest;
  mutation: EvalMutation;
  perturbationReferences: ReadonlyMap<string, RenderedReference>;
  proposal: RepairProposal;
  server: EvalFixtureServer;
}): Promise<HiddenAcceptanceResult> {
  const perturbationOutcomes: HiddenPerturbationOutcome[] = [];
  for (const perturbation of options.manifest.perturbations) {
    const story = options.server.workspacePerturbationUrls.get(perturbation.id);
    const reference = options.perturbationReferences.get(perturbation.id);
    if (!story || !reference) {
      throw new Error(`Perturbation evaluation inputs are incomplete for ${perturbation.id}`);
    }
    const replay = await replayPerturbation({
      manifest: options.manifest,
      perturbation,
      reference,
      server: options.server,
      story,
    });
    const passed =
      replay.comparison.visible.pass &&
      expectedMetadataMatches(replay.metadata, perturbation.expectedMetadata);
    perturbationOutcomes.push({
      actualMetadata: replay.metadata,
      comparison: replay.comparison.visible,
      expectedMetadata: perturbation.expectedMetadata,
      id: perturbation.id,
      passed,
    });
  }
  return evaluateHiddenAcceptance(options.manifest, options.mutation, options.proposal, {
    finalComparisonPassed: options.finalComparison.visible.pass,
    perturbationOutcomes,
  });
}

export async function replayPerturbation(options: {
  manifest: EvalManifest;
  perturbation: EvalPerturbation;
  reference: RenderedReference;
  server: EvalFixtureServer;
  story: string;
}): Promise<PerturbationReplay> {
  const comparison = await compareVariant({
    manifest: options.manifest,
    purpose: 'hidden',
    referencePngB64: options.reference.pngB64,
    server: options.server,
    story: options.story,
  });
  const rendered = await renderVariant(options.manifest, options.story, true);
  if (!rendered.metadata) {
    throw new Error(
      `Perturbation ${options.perturbation.id} metadata was not captured after repair`
    );
  }
  return { comparison, metadata: rendered.metadata };
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
    assertMetadataMatches(reference.metadata, manifest.reference.expectedMetadata, 'Reference');
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
