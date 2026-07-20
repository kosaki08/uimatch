import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalFixtureBaseCssPath, resolveEvalPath } from './manifest.js';
import type { EvalManifest, EvalMutation, RepairChange, RepairProposal } from './types.js';

export interface WorkspaceVariant {
  cssPath: string;
  htmlPath: string;
}

export interface RepairWorkspace {
  agentInput: WorkspaceVariant;
  applyProposal(proposal: RepairProposal): Promise<void>;
  baseCssPath: string;
  close(): Promise<void>;
  implementation: WorkspaceVariant;
  implementationSource: {
    css: string;
    html: string;
  };
  perturbations: ReadonlyMap<string, WorkspaceVariant>;
  reset(): Promise<void>;
}

const cssPropertyPattern = /^(?:--[a-z0-9-]+|[a-z][a-z0-9-]*)$/;
const unsafeCssValuePattern =
  /[;{}]|\/\*|\*\/|(?:url|image|image-set|cross-fade)\s*\(|(?:https?|data|file|javascript):|\/\//i;

function renderOverride(change: RepairChange, editableSelectors: ReadonlySet<string>): string {
  const selector = change.selector.trim();
  const property = change.property.trim().toLowerCase();
  const value = change.value.trim();
  if (!editableSelectors.has(selector)) {
    throw new RangeError(`Selector is outside the editable fixture scope: ${selector}`);
  }
  if (!cssPropertyPattern.test(property)) {
    throw new RangeError(`CSS property is invalid: ${change.property}`);
  }
  if (value.length === 0 || value.length > 200 || unsafeCssValuePattern.test(value)) {
    throw new RangeError(`CSS value is invalid or unsafe for ${property}`);
  }
  return `${selector} {\n  ${property}: ${value};\n}`;
}

function applyProposalToCss(
  source: string,
  proposal: RepairProposal,
  editableSelectors: readonly string[]
): string {
  const selectors = new Set(editableSelectors);
  const overrides = proposal.changes.map((change) => renderOverride(change, selectors));
  return `${source.trimEnd()}\n\n/* uiMatch eval proposal */\n${overrides.join('\n\n')}\n`;
}

async function copyVariant(
  directory: string,
  source: { css: string; html: string }
): Promise<{ originalCss: string; variant: WorkspaceVariant }> {
  await mkdir(directory, { recursive: true });
  const variant = {
    cssPath: join(directory, 'styles.css'),
    htmlPath: join(directory, 'index.html'),
  };
  const originalCss = await readFile(resolveEvalPath(source.css), 'utf8');
  await Promise.all([
    copyFile(resolveEvalPath(source.html), variant.htmlPath),
    writeFile(variant.cssPath, originalCss, 'utf8'),
  ]);
  return { originalCss, variant };
}

export async function createRepairWorkspace(
  manifest: EvalManifest,
  mutation: EvalMutation
): Promise<RepairWorkspace> {
  const harnessRootDirectory = await mkdtemp(join(tmpdir(), 'uimatch-eval-harness-'));
  let agentRootDirectory: string | undefined;
  try {
    const agentRoot = await mkdtemp(join(tmpdir(), 'uimatch-eval-agent-'));
    agentRootDirectory = agentRoot;
    const [current, agentInput] = await Promise.all([
      copyVariant(join(harnessRootDirectory, 'current'), mutation),
      copyVariant(join(agentRoot, 'input'), mutation),
    ]);
    const implementationHtml = await readFile(current.variant.htmlPath, 'utf8');
    const perturbationEntries = await Promise.all(
      manifest.perturbations.map(async (perturbation) => {
        const candidate = mutation.candidates.get(perturbation.id);
        if (!candidate) {
          throw new Error(
            `Mutation ${mutation.id} has no repair candidate for perturbation ${perturbation.id}`
          );
        }
        const copied = await copyVariant(
          join(harnessRootDirectory, 'perturbations', perturbation.id),
          candidate
        );
        return [perturbation.id, copied] as const;
      })
    );
    const perturbationCopies = new Map(perturbationEntries);

    const writeWorkspaceCss = async (proposal?: RepairProposal): Promise<void> => {
      await Promise.all([
        writeFile(
          current.variant.cssPath,
          proposal
            ? applyProposalToCss(current.originalCss, proposal, manifest.editableSelectors)
            : current.originalCss,
          'utf8'
        ),
        ...[...perturbationCopies.values()].map(async (copy) =>
          writeFile(
            copy.variant.cssPath,
            proposal
              ? applyProposalToCss(copy.originalCss, proposal, manifest.editableSelectors)
              : copy.originalCss,
            'utf8'
          )
        ),
      ]);
    };

    return {
      agentInput: agentInput.variant,
      async applyProposal(proposal): Promise<void> {
        await writeWorkspaceCss(proposal);
      },
      baseCssPath: evalFixtureBaseCssPath(manifest.fixtureId),
      async close(): Promise<void> {
        const cleanup = await Promise.allSettled([
          rm(harnessRootDirectory, { force: true, recursive: true }),
          rm(agentRoot, { force: true, recursive: true }),
        ]);
        const failures = cleanup.filter((result) => result.status === 'rejected');
        if (failures.length > 0) {
          throw new AggregateError(
            failures.map((failure) => {
              const reason: unknown = failure.reason;
              return reason instanceof Error ? reason : new Error(String(reason));
            }),
            'Eval repair workspace cleanup failed'
          );
        }
      },
      implementation: current.variant,
      implementationSource: {
        css: current.originalCss,
        html: implementationHtml,
      },
      perturbations: new Map(
        [...perturbationCopies].map(([id, copy]) => [id, copy.variant] as const)
      ),
      async reset(): Promise<void> {
        await writeWorkspaceCss();
      },
    };
  } catch (error) {
    await Promise.allSettled([
      rm(harnessRootDirectory, { force: true, recursive: true }),
      ...(agentRootDirectory ? [rm(agentRootDirectory, { force: true, recursive: true })] : []),
    ]);
    throw error;
  }
}
