#!/usr/bin/env node
/**
 * uiMatch CLI - Suite runner
 * Execute multiple compare jobs (screens/components) from a JSON suite file.
 */

import { uiMatchCompare } from '#plugin/commands/compare';
import type { CompareArgs } from '#plugin/types/index';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from './logger.js';
import { errln, outln } from './print.js';

type SuiteItem = {
  name: string;
  figma: string; // "fileKey:nodeId" or full URL or "current"
  story: string; // target URL (Storybook iframe or any page)
  selector: string; // CSS selector for the root element
  viewport?: { width: number; height: number };
  dpr?: number;
  figmaScale?: number; // Figma export scale (1-4, separate from browser DPR)
  figmaAutoRoi?: boolean; // Auto-detect best matching child node (REST only)
  detectStorybookIframe?: boolean;
  size?: 'strict' | 'pad' | 'crop' | 'scale';
  align?: 'center' | 'top-left' | 'top' | 'left';
  padColor?: 'auto' | { r: number; g: number; b: number };
  contentBasis?: 'union' | 'intersection' | 'figma' | 'impl';
  thresholds?: CompareArgs['thresholds'];
  pixelmatch?: { threshold?: number; includeAA?: boolean };
  tokens?: Record<string, Record<string, string>>;
  ignore?: string[];
  weights?: Record<string, number>;
  bootstrap?: boolean; // derive expectedSpec from Figma node if true
  textCheck?: CompareArgs['textCheck'];
  textGate?: boolean;
};

type SuiteConfig = {
  name?: string;
  defaults?: Partial<SuiteItem>;
  items: SuiteItem[];
};

interface ParsedArgs {
  path?: string;
  outDir?: string;
  concurrency?: string;
  verbose?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (const arg of argv) {
    const m = arg.match(/^(\w+)=([\s\S]+)$/);
    if (m && m[1] && m[2]) {
      (out as Record<string, string>)[m[1]] = m[2];
    }
  }
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (it: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: (R | undefined)[] = Array.from({ length: items.length }, () => undefined);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      const item = items[idx];
      if (item !== undefined) {
        results[idx] = await worker(item, idx);
      }
    }
  });
  await Promise.all(workers);
  return results.filter((r): r is R => r !== undefined);
}

function mergeItem(defaults: Partial<SuiteItem> | undefined, item: SuiteItem): SuiteItem {
  return {
    ...defaults,
    ...item,
    viewport: item.viewport ?? defaults?.viewport,
    tokens: item.tokens ?? defaults?.tokens,
    thresholds: { ...(defaults?.thresholds ?? {}), ...(item.thresholds ?? {}) },
    pixelmatch: { ...(defaults?.pixelmatch ?? {}), ...(item.pixelmatch ?? {}) },
    weights: { ...(defaults?.weights ?? {}), ...(item.weights ?? {}) },
    ignore: item.ignore ?? defaults?.ignore,
    contentBasis: item.contentBasis ?? defaults?.contentBasis,
    textCheck: item.textCheck ?? defaults?.textCheck,
    textGate: item.textGate ?? defaults?.textGate,
  };
}

export async function runSuite(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (!args.path) {
    errln(
      'Usage: uimatch suite path=<suite.json> [outDir=.uimatch-suite] [concurrency=4] [verbose=false]'
    );
    process.exit(2);
  }
  const suitePath = args.path;
  const outBase = args.outDir ?? '.uimatch-suite';
  const concurrency = Math.max(1, parseInt(args.concurrency ?? '4', 10));

  const raw = await readFile(suitePath, 'utf8');
  const cfg = JSON.parse(raw) as SuiteConfig;

  await mkdir(outBase, { recursive: true });

  type SuiteResult = {
    name: string;
    ok: boolean;
    dfs: number;
    pixelDiff: number;
    colorDE: number;
    outDir: string;
    error?: string;
    styleDiffs?: number;
    highCount?: number;
  };

  const logger = getLogger();

  const results = await runWithConcurrency<SuiteItem, SuiteResult>(
    cfg.items.map((i) => mergeItem(cfg.defaults, i)),
    concurrency,
    async (item, index) => {
      const itemName = item.name ?? `case-${index + 1}`;
      const itemDir = join(outBase, `${String(index + 1).padStart(3, '0')}-${slugify(itemName)}`);
      await mkdir(itemDir, { recursive: true });

      logger.info(
        {
          figma: item.figma,
          story: item.story,
          selector: item.selector,
        },
        `Suite item #${index + 1}: ${itemName}`
      );

      try {
        const res = await uiMatchCompare({
          figma: item.figma,
          story: item.story,
          selector: item.selector,
          viewport: item.viewport,
          dpr: item.dpr,
          figmaScale: item.figmaScale,
          figmaAutoRoi: item.figmaAutoRoi,
          detectStorybookIframe:
            item.detectStorybookIframe ?? /\/iframe\.html(\?|$)/.test(item.story),
          sizeMode: item.size,
          align: item.align,
          padColor: item.padColor ?? 'auto',
          contentBasis: item.contentBasis,
          thresholds: item.thresholds,
          pixelmatch: item.pixelmatch,
          tokens: item.tokens,
          ignore: item.ignore,
          weights: item.weights,
          reuseBrowser: true,
          emitArtifacts: true,
          // bootstrap expectedSpec for first-time runs if requested
          bootstrapExpectedFromFigma: Boolean(item.bootstrap),
          textCheck: item.textCheck, // Pass text check configuration
        });

        const rep = res.report;
        const figs = rep.artifacts;
        if (figs) {
          await writeFile(join(itemDir, 'figma.png'), Buffer.from(figs.figmaPngB64, 'base64'));
          await writeFile(join(itemDir, 'impl.png'), Buffer.from(figs.implPngB64, 'base64'));
          await writeFile(join(itemDir, 'diff.png'), Buffer.from(figs.diffPngB64, 'base64'));
        }

        const textGateMode = item.textGate && rep.textMatch?.enabled;
        const ok = textGateMode ? Boolean(rep.textMatch?.equal) : Boolean(rep.qualityGate?.pass);

        await writeFile(join(itemDir, 'report.json'), JSON.stringify(rep, null, 2));

        const styleDiffsArray = Array.isArray(rep.styleDiffs) ? rep.styleDiffs : [];
        const styleDiffsCount = styleDiffsArray.length;
        const highCount = styleDiffsArray.filter((d) => d.severity === 'high').length;

        if (!ok) {
          logger.warn(
            `Item ${itemName} FAIL: ${rep.qualityGate?.reasons?.join(' | ') || 'quality gate failed'}`
          );
        } else {
          logger.info(`Item ${itemName} PASS`);
        }

        const metrics = rep.metrics;
        const dfsValue = metrics.dfs ?? 0;
        const colorDEValue = metrics.colorDeltaEAvg ?? 0;

        return {
          name: itemName,
          ok,
          dfs: dfsValue,
          pixelDiff: metrics.pixelDiffRatio ?? 0,
          colorDE: colorDEValue,
          outDir: itemDir,
          styleDiffs: styleDiffsCount,
          highCount,
        };
      } catch (e) {
        const errMsg = (e as Error)?.message ?? String(e);
        logger.error(`Item ${itemName} ERROR: ${errMsg}`);
        await writeFile(
          join(itemDir, 'error.txt'),
          `[uiMatch] Error in "${itemName}": ${errMsg}\n`
        );
        return {
          name: itemName,
          ok: false,
          dfs: 0,
          pixelDiff: 1,
          colorDE: 999,
          outDir: itemDir,
          error: errMsg,
        };
      }
    }
  );

  // Write suite-level report
  const summary = {
    name: cfg.name ?? 'uiMatch Suite',
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.error).length,
    errors: results.filter((r) => Boolean(r.error)).length,
    items: results,
  };
  await writeFile(join(outBase, 'suite-report.json'), JSON.stringify(summary, null, 2));

  // Pretty print
  outln(`\n=== ${summary.name} ===`);
  for (const r of results) {
    const badge = r.ok ? '✓' : r.error ? 'E' : '✖';
    outln(
      `${badge} ${r.name}  ->  DFS:${r.dfs}  pix:${(r.pixelDiff * 100).toFixed(1)}%  ΔE:${r.colorDE.toFixed(2)}  out:${r.outDir}`
    );
  }
  outln(
    `\nTotal ${summary.total}, Passed ${summary.passed}, Failed ${summary.failed}, Errors ${summary.errors}`
  );
  process.exit(summary.failed === 0 && summary.errors === 0 ? 0 : 1);
}
