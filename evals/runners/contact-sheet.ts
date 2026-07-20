import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evalRoot } from '../manifest.js';
import {
  conditionIds,
  evalIdentifierPattern,
  evalRunIdPattern,
  type ConditionId,
  type EvalArtifactFile,
  type EvalResult,
} from '../types.js';
import { EvalUsageError } from './build-cli.js';
import { loadEvalRunResults } from './report.js';

interface ContactSheetOptions {
  conditions: ConditionId[];
  perturbations?: string[];
  runId: string;
}

function parseList(value: string, label: string): string[] {
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => !evalIdentifierPattern.test(entry))) {
    throw new EvalUsageError(`${label} must be a comma-separated list of eval identifiers.`);
  }
  return entries;
}

function parseArguments(args: string[]): ContactSheetOptions {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  let runId: string | undefined;
  let conditions: ConditionId[] = ['pixel-diff', 'flat-diff'];
  let perturbations: string[] | undefined;
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (!flag || !value) {
      throw new EvalUsageError(
        'Usage: pnpm eval:contact-sheet -- --run YYYYMMDD_<run-id> [--conditions pixel-diff,flat-diff] [--perturbations long-label]'
      );
    }
    if (flag === '--run') runId = value;
    else if (flag === '--conditions') {
      const parsed = parseList(value, '--conditions');
      if (!parsed.every((entry) => conditionIds.some((condition) => condition === entry))) {
        throw new EvalUsageError('--conditions contains an unknown eval condition.');
      }
      conditions = parsed as ConditionId[];
    } else if (flag === '--perturbations') {
      perturbations = parseList(value, '--perturbations');
    } else {
      throw new EvalUsageError(`Unknown contact-sheet option: ${flag}`);
    }
  }
  if (!runId || !evalRunIdPattern.test(runId)) {
    throw new EvalUsageError('--run must use YYYYMMDD_<name>.');
  }
  if (new Set(conditions).size !== conditions.length) {
    throw new EvalUsageError('--conditions must not contain duplicates.');
  }
  return { conditions, ...(perturbations ? { perturbations } : {}), runId };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function imageSource(sheetPath: string, artifact: EvalArtifactFile): string {
  return relative(dirname(sheetPath), resolve(evalRoot, artifact.path)).split(sep).join('/');
}

function metricLabel(result: EvalResult, caseId: string): string {
  if (caseId === 'normal') {
    const metrics = result.finalComparison;
    return metrics ? `DFS ${metrics.dfs}; visible ${metrics.pass ? 'PASS' : 'FAIL'}` : 'No metrics';
  }
  const outcome = result.acceptance?.perturbationOutcomes?.find(
    (candidate) => candidate.id === caseId
  );
  return outcome
    ? `DFS ${outcome.comparison.dfs}; hidden ${outcome.passed ? 'PASS' : 'FAIL'}`
    : 'No hidden outcome';
}

function implementationArtifact(result: EvalResult, caseId: string): EvalArtifactFile | undefined {
  if (caseId === 'normal') return result.artifacts?.final.implementation;
  return result.artifacts?.perturbations?.[caseId]?.implementation;
}

function referenceArtifact(results: EvalResult[], caseId: string): EvalArtifactFile | undefined {
  for (const result of results) {
    const artifact =
      caseId === 'normal'
        ? result.artifacts?.final.reference
        : result.artifacts?.perturbations?.[caseId]?.reference;
    if (artifact) return artifact;
  }
  return undefined;
}

function failedPerturbations(results: EvalResult[]): string[] {
  return [
    ...new Set(
      results.flatMap(
        (result) =>
          result.acceptance?.perturbationOutcomes
            ?.filter((outcome) => !outcome.passed)
            .map((outcome) => outcome.id) ?? []
      )
    ),
  ].sort();
}

function renderCell(
  sheetPath: string,
  heading: string,
  artifact: EvalArtifactFile | undefined,
  caption: string
): string {
  return `<section><h3>${escapeHtml(heading)}</h3>${
    artifact
      ? `<img src="${escapeHtml(imageSource(sheetPath, artifact))}" alt="${escapeHtml(heading)}">`
      : '<p class="missing">No audit artifact is available for this result.</p>'
  }<p>${escapeHtml(caption)}</p></section>`;
}

async function writeContactSheet(
  results: EvalResult[],
  options: ContactSheetOptions
): Promise<string> {
  const first = results[0];
  if (!first) throw new Error('Contact sheet requires at least one result');
  const requestedPerturbations = options.perturbations ?? failedPerturbations(results);
  const cases = ['normal', ...requestedPerturbations];
  const sheetPath = resolve(
    evalRoot,
    'artifacts',
    options.runId,
    'contact-sheets',
    `${first.fixtureId}--${first.mutationId}--trial-${first.trial}.html`
  );
  const rows = cases
    .map((caseId) => {
      const reference = referenceArtifact(results, caseId);
      const cells = [
        renderCell(
          sheetPath,
          `${caseId}: reference`,
          reference,
          caseId === 'normal' ? 'Visible reference' : 'Hidden perturbation reference'
        ),
        ...options.conditions.map((condition) => {
          const result = results.find((candidate) => candidate.condition === condition);
          return renderCell(
            sheetPath,
            `${caseId}: ${condition}`,
            result ? implementationArtifact(result, caseId) : undefined,
            result ? metricLabel(result, caseId) : 'Result not found'
          );
        }),
      ];
      return `<div class="row">${cells.join('')}</div>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(options.runId)} audit contact sheet</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; }
    body { background: #f6f7f9; color: #111827; margin: 0; padding: 32px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .meta { color: #4b5563; margin: 0 0 24px; }
    .row { display: grid; gap: 16px; grid-template-columns: repeat(${options.conditions.length + 1}, minmax(0, 1fr)); margin-bottom: 16px; }
    section { background: white; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; }
    h3 { font-size: 14px; margin: 0 0 12px; }
    img { background: white; image-rendering: auto; max-width: 100%; }
    p { color: #4b5563; font-size: 13px; margin: 12px 0 0; }
    .missing { color: #b45309; }
  </style>
</head>
<body>
  <h1>uiMatch eval audit</h1>
  <p class="meta">${escapeHtml(options.runId)} · ${escapeHtml(first.fixtureId)} · ${escapeHtml(first.mutationId)} · trial ${first.trial}</p>
  ${rows}
</body>
</html>
`;
  await mkdir(dirname(sheetPath), { recursive: true });
  await writeFile(sheetPath, html, 'utf8');
  return sheetPath;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  let stored;
  try {
    stored = await loadEvalRunResults(options.runId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new EvalUsageError(`No eval results found for run ${options.runId}.`);
    }
    throw error;
  }
  const selected = stored
    .map((entry) => entry.result)
    .filter((result) => options.conditions.includes(result.condition));
  if (selected.length === 0) {
    throw new EvalUsageError('No selected conditions contain eval results.');
  }
  const groups = new Map<string, EvalResult[]>();
  for (const result of selected) {
    const key = `${result.fixtureId}/${result.mutationId}/${result.trial}`;
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }
  for (const results of groups.values()) {
    const sheet = await writeContactSheet(results, options);
    console.log(`Wrote ${sheet}`);
  }
}

function handleMainError(error: unknown): void {
  if (error instanceof EvalUsageError) {
    console.error(`Eval contact-sheet error: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  void main().catch(handleMainError);
}
