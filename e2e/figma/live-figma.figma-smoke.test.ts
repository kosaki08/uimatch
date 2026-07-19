import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { cliProcessArgs } from '../../test-utils/run-cli.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const fixturesDirectory = join(import.meta.dirname, 'fixtures');
// Live baseline: Atomic 14.19%, Composite <8%; the CLI gate keeps one extra point
// so the tighter per-fixture assertions remain the diagnostic boundary.
const gatePixelDiffThreshold = 0.16;
const atomicPixelDiffUpperBound = 0.15;
const compositePixelDiffUpperBound = 0.08;

const fixtureRoutes = new Map<string, { path: string; contentType: string }>([
  [
    '/atomic-clean.html',
    { path: join(fixturesDirectory, 'atomic-clean.html'), contentType: 'text/html; charset=utf-8' },
  ],
  [
    '/composite-clean.html',
    {
      path: join(fixturesDirectory, 'composite-clean.html'),
      contentType: 'text/html; charset=utf-8',
    },
  ],
  [
    '/composite-gap-defect.html',
    {
      path: join(fixturesDirectory, 'composite-gap-defect.html'),
      contentType: 'text/html; charset=utf-8',
    },
  ],
  [
    '/smoke.css',
    { path: join(fixturesDirectory, 'smoke.css'), contentType: 'text/css; charset=utf-8' },
  ],
  [
    '/font-ready.js',
    {
      path: join(fixturesDirectory, 'font-ready.js'),
      contentType: 'text/javascript; charset=utf-8',
    },
  ],
  [
    '/fonts/inter-latin-wght-normal.woff2',
    {
      path: join(
        repositoryRoot,
        'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'
      ),
      contentType: 'font/woff2',
    },
  ],
]);

interface StyleDiff {
  isRoot?: boolean;
  selector: string;
  severity: 'low' | 'medium' | 'high';
  properties: Record<string, { actual?: string; expected?: string }>;
}

interface CompareReport {
  metrics: {
    pixelDiffRatio: number;
    pixelDiffRatioContent?: number;
  };
  styleDiffs: StyleDiff[];
  qualityGate: {
    pass: boolean;
    thresholds: { pixelDiffRatio: number; maxHighSeverityIssues: number };
  };
  selectorResolution?: { chosen?: string };
}

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
  outDir: string;
  expectedPath: string;
}

type JsonObject = Record<string, unknown>;

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required for the live Figma smoke suite. Run it through pnpm run test:figma-smoke.`
    );
  }
  return value;
}

function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Figma response field ${label} must be an object`);
  }
  return value as JsonObject;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Figma response field ${label} must be an array`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Figma response field ${label} must be a finite number`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Figma response field ${label} must be a string`);
  }
  return value;
}

function childrenOf(node: JsonObject, label: string): JsonObject[] {
  return asArray(node.children, `${label}.children`).map((child, index) =>
    asObject(child, `${label}.children[${index}]`)
  );
}

function sizeOf(node: JsonObject, label: string): { width: number; height: number } {
  const box = asObject(node.absoluteBoundingBox, `${label}.absoluteBoundingBox`);
  return {
    width: asNumber(box.width, `${label}.width`),
    height: asNumber(box.height, `${label}.height`),
  };
}

function paddingOf(node: JsonObject, label: string): number[] {
  return ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((name) =>
    asNumber(node[name], `${label}.${name}`)
  );
}

function typographyOf(node: JsonObject, label: string): JsonObject {
  return asObject(node.style, `${label}.style`);
}

function normalizeDesignContract(atomic: JsonObject, composite: JsonObject): unknown {
  const atomicChildren = childrenOf(atomic, 'atomic');
  const atomicText = atomicChildren[0];
  if (!atomicText) throw new TypeError('Figma atomic fixture must have one text child');
  const atomicStyle = typographyOf(atomicText, 'atomic.text');

  const compositeChildren = childrenOf(composite, 'composite');
  const title = compositeChildren[0];
  const table = compositeChildren[1];
  if (!title || !table) throw new TypeError('Figma composite fixture must have title and table');
  const titleStyle = typographyOf(title, 'composite.title');
  const rows = childrenOf(table, 'composite.table');
  const firstRow = rows[0];
  if (!firstRow) throw new TypeError('Figma composite table must have at least one row');
  const cells = childrenOf(firstRow, 'composite.table.firstRow');

  return {
    atomic: {
      type: asString(atomic.type, 'atomic.type'),
      size: sizeOf(atomic, 'atomic'),
      layoutMode: asString(atomic.layoutMode, 'atomic.layoutMode'),
      gap: asNumber(atomic.itemSpacing, 'atomic.itemSpacing'),
      padding: paddingOf(atomic, 'atomic'),
      childCount: atomicChildren.length,
      text: {
        fontFamily: asString(atomicStyle.fontFamily, 'atomic.text.fontFamily'),
        fontSize: asNumber(atomicStyle.fontSize, 'atomic.text.fontSize'),
        fontWeight: asNumber(atomicStyle.fontWeight, 'atomic.text.fontWeight'),
        lineHeight: asNumber(atomicStyle.lineHeightPx, 'atomic.text.lineHeightPx'),
        textDecoration: asString(atomicStyle.textDecoration, 'atomic.text.textDecoration'),
      },
    },
    composite: {
      type: asString(composite.type, 'composite.type'),
      size: sizeOf(composite, 'composite'),
      layoutMode: asString(composite.layoutMode, 'composite.layoutMode'),
      gap: asNumber(composite.itemSpacing, 'composite.itemSpacing'),
      childCount: compositeChildren.length,
      title: {
        fontFamily: asString(titleStyle.fontFamily, 'composite.title.fontFamily'),
        fontSize: asNumber(titleStyle.fontSize, 'composite.title.fontSize'),
        fontWeight: asNumber(titleStyle.fontWeight, 'composite.title.fontWeight'),
        lineHeight: asNumber(titleStyle.lineHeightPx, 'composite.title.lineHeightPx'),
        letterSpacing: Number(
          asNumber(titleStyle.letterSpacing, 'composite.title.letterSpacing').toFixed(3)
        ),
      },
      table: {
        size: sizeOf(table, 'composite.table'),
        layoutMode: asString(table.layoutMode, 'composite.table.layoutMode'),
        rowCount: rows.length,
        firstRow: {
          size: sizeOf(firstRow, 'composite.table.firstRow'),
          layoutMode: asString(firstRow.layoutMode, 'composite.table.firstRow.layoutMode'),
          cellWidths: cells.map(
            (cell, index) => sizeOf(cell, `composite.table.firstRow.cells[${index}]`).width
          ),
          cellPadding: paddingOf(cells[0] ?? {}, 'composite.table.firstRow.cells[0]'),
          cellGap: asNumber(cells[0]?.itemSpacing, 'composite.table.firstRow.cells[0].itemSpacing'),
          fontWeights: cells.map((cell, index) => {
            const text = childrenOf(cell, `composite.table.firstRow.cells[${index}]`)[0];
            if (!text) throw new TypeError(`Figma table cell ${index} must have a text child`);
            const style = typographyOf(text, `composite.table.firstRow.cells[${index}].text`);
            return asNumber(
              style.fontWeight,
              `composite.table.firstRow.cells[${index}].fontWeight`
            );
          }),
        },
      },
    },
  };
}

function normalizeNodeId(nodeId: string): string {
  return nodeId.replace('-', ':');
}

async function fetchFigmaNodes(fileKey: string, nodeIds: readonly string[]): Promise<JsonObject[]> {
  const url = new URL(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/nodes`);
  const normalizedIds = nodeIds.map(normalizeNodeId);
  url.searchParams.set('ids', normalizedIds.join(','));

  const response = await fetch(url, {
    headers: { 'X-Figma-Token': requireEnvironment('FIGMA_ACCESS_TOKEN') },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Figma fixture metadata request failed with HTTP ${response.status}`);
  }

  const body = asObject(await response.json(), 'response');
  const nodes = asObject(body.nodes, 'response.nodes');
  return normalizedIds.map((nodeId) => {
    const entry = asObject(nodes[nodeId], `response.nodes[${nodeId}]`);
    return asObject(entry.document, `response.nodes[${nodeId}].document`);
  });
}

async function startFixtureServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const route = fixtureRoutes.get(pathname);
    if (!route) {
      response.writeHead(404).end('Not found');
      return;
    }

    void readFile(route.path)
      .then((content) => {
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': route.contentType,
        });
        response.end(content);
      })
      .catch((error: unknown) => {
        response
          .writeHead(500)
          .end(error instanceof Error ? error.message : 'Fixture server error');
      });
  });

  await new Promise<void>((resolveListening, rejectListening) => {
    server.once('error', rejectListening);
    server.listen(0, '127.0.0.1', () => resolveListening());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not bind to a TCP port');
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

async function runCli(
  args: readonly string[],
  cwd: string
): Promise<{
  status: number;
  stdout: string;
  stderr: string;
}> {
  return await new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, cliProcessArgs(args), {
      cwd,
      env: {
        ...process.env,
        UIMATCH_HEADLESS: 'true',
        UIMATCH_LOG_LEVEL: 'silent',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      rejectChild(new Error('uiMatch CLI exceeded the 120 second Figma smoke deadline'));
    }, 120_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectChild(error);
    });
    child.once('close', (status) => {
      clearTimeout(timeout);
      resolveChild({ status: status ?? 1, stdout, stderr });
    });
  });
}

describe.sequential('live Figma smoke suite', () => {
  const fileKey = requireEnvironment('UIMATCH_FIGMA_SMOKE_FILE_KEY');
  const atomicNodeId = requireEnvironment('UIMATCH_FIGMA_SMOKE_ATOMIC_NODE_ID');
  const compositeNodeId = requireEnvironment('UIMATCH_FIGMA_SMOKE_COMPOSITE_NODE_ID');
  const pluginUrl = pathToFileURL(join(fixturesDirectory, 'selector-plugin.mjs')).href;
  let server: Server;
  let fixtureOrigin: string;
  let tempDirectory: string;

  beforeAll(async () => {
    requireEnvironment('FIGMA_ACCESS_TOKEN');
    ({ server, origin: fixtureOrigin } = await startFixtureServer());
    tempDirectory = await mkdtemp(join(tmpdir(), 'uimatch-figma-smoke-'));
    await writeFile(
      join(tempDirectory, '.uimatchrc.json'),
      JSON.stringify({ comparison: { acceptancePixelDiffRatio: gatePixelDiffThreshold } }),
      'utf8'
    );
  });

  afterAll(async () => {
    await closeServer(server);
    await rm(tempDirectory, { recursive: true, force: true });
  });

  async function compareFixture(options: {
    name: string;
    nodeId: string;
    page: string;
    selector: string;
    selectorsPlugin?: string;
  }): Promise<CliResult> {
    const outDir = join(tempDirectory, options.name);
    const expectedPath = join(tempDirectory, `${options.name}-expected.json`);
    const args = [
      'compare',
      `figma=${fileKey}:${normalizeNodeId(options.nodeId).replace(':', '-')}`,
      `story=${fixtureOrigin}/${options.page}`,
      `selector=${options.selector}`,
      'size=pad',
      'contentBasis=intersection',
      'padColor=auto',
      'areaGapCritical=0.05',
      'areaGapWarning=0.03',
      'dpr=1',
      'figmaScale=1',
      'bootstrap=true',
      `saveExpected=${expectedPath}`,
      `outDir=${outDir}`,
      'timestampOutDir=false',
      'jsonOnly=true',
    ];
    if (options.selectorsPlugin) {
      args.push(`selectorsPlugin=${options.selectorsPlugin}`);
    }

    const result = await runCli(args, tempDirectory);
    return { ...result, outDir, expectedPath };
  }

  function failureContext(result: CliResult): string {
    return `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
  }

  async function readReport(result: CliResult): Promise<CompareReport> {
    return JSON.parse(await readFile(join(result.outDir, 'report.json'), 'utf8')) as CompareReport;
  }

  async function expectArtifacts(result: CliResult): Promise<void> {
    for (const file of ['figma.png', 'impl.png', 'diff.png', 'report.json']) {
      await expect(readFile(join(result.outDir, file))).resolves.toBeInstanceOf(Buffer);
    }
    await expect(readFile(result.expectedPath, 'utf8')).resolves.not.toHaveLength(0);
  }

  function effectivePixelRatio(report: CompareReport): number {
    return report.metrics.pixelDiffRatioContent ?? report.metrics.pixelDiffRatio;
  }

  test('matches the frozen Figma node metadata contract', async () => {
    const [atomic, composite] = await fetchFigmaNodes(fileKey, [atomicNodeId, compositeNodeId]);
    if (!atomic || !composite) throw new Error('Figma metadata response omitted a fixture node');
    const expectedContract: unknown = JSON.parse(
      readFileSync(join(fixturesDirectory, 'design-contract.json'), 'utf8')
    );

    expect(
      normalizeDesignContract(atomic, composite),
      'The live Figma smoke fixture changed. Restore the frozen nodes or intentionally update design-contract.json before diagnosing uiMatch.'
    ).toEqual(expectedContract);
  });

  test('compares an Atomic node and emits structured artifacts', async () => {
    const result = await compareFixture({
      name: 'atomic-clean',
      nodeId: atomicNodeId,
      page: 'atomic-clean.html',
      selector: '#atomic',
    });
    expect(result.status, failureContext(result)).toBe(0);
    await expectArtifacts(result);

    const report = await readReport(result);
    const expected = JSON.parse(await readFile(result.expectedPath, 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    expect(report.qualityGate.pass).toBe(true);
    expect(report.qualityGate.thresholds.pixelDiffRatio).toBe(gatePixelDiffThreshold);
    expect(report.qualityGate.thresholds.maxHighSeverityIssues).toBe(0);
    expect(report.styleDiffs.filter((diff) => diff.severity === 'high')).toEqual([]);
    expect(effectivePixelRatio(report)).toBeLessThan(atomicPixelDiffUpperBound);
    expect(expected.__self__).toMatchObject({
      display: 'flex',
      'flex-direction': 'row',
      gap: '10px',
      'padding-top': '8px',
      'padding-right': '16px',
      width: '96px',
      height: '40px',
    });
    expect(expected['__self__ > :nth-child(1)']).toMatchObject({
      'font-family': 'Inter',
      'font-size': '14px',
      'font-weight': '500',
      'line-height': '24px',
    });
  });

  test('detects a fixed Composite gap defect and passes the clean variant', async () => {
    const defect = await compareFixture({
      name: 'composite-gap-defect',
      nodeId: compositeNodeId,
      page: 'composite-gap-defect.html',
      selector: '#legacy-composite',
      selectorsPlugin: pluginUrl,
    });
    expect(defect.status, failureContext(defect)).toBe(1);
    await expectArtifacts(defect);
    const defectReport = await readReport(defect);
    const rootGapDiff = defectReport.styleDiffs.find((diff) => diff.isRoot)?.properties.gap;
    expect(rootGapDiff).toMatchObject({ expected: '32px', actual: '48px' });

    const clean = await compareFixture({
      name: 'composite-clean',
      nodeId: compositeNodeId,
      page: 'composite-clean.html',
      selector: '#legacy-composite',
      selectorsPlugin: pluginUrl,
    });
    expect(clean.status, failureContext(clean)).toBe(0);
    await expectArtifacts(clean);
    const cleanReport = await readReport(clean);
    const expected = JSON.parse(await readFile(clean.expectedPath, 'utf8')) as Record<
      string,
      Record<string, string>
    >;

    expect(cleanReport.qualityGate.pass).toBe(true);
    expect(cleanReport.qualityGate.thresholds.pixelDiffRatio).toBe(gatePixelDiffThreshold);
    expect(cleanReport.qualityGate.thresholds.maxHighSeverityIssues).toBe(0);
    expect(cleanReport.styleDiffs.filter((diff) => diff.severity === 'high')).toEqual([]);
    expect(cleanReport.selectorResolution?.chosen).toBe('#composite');
    expect(effectivePixelRatio(cleanReport)).toBeLessThan(compositePixelDiffUpperBound);
    expect(expected.__self__).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      gap: '32px',
      width: '969px',
      height: '228px',
    });
    expect(expected['__self__ > :nth-child(1)']).toMatchObject({
      'font-family': 'Inter',
      'font-size': '30px',
      'font-weight': '600',
      'line-height': '36px',
    });
    expect(expected['__self__ > :nth-child(2)']).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
    });
    expect(expected['__self__ > :nth-child(2) > :nth-child(1) > :nth-child(1)']).toMatchObject({
      display: 'flex',
      gap: '10px',
      'padding-top': '8px',
      'padding-left': '16px',
    });
  });
});
