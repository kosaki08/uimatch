import { join, resolve } from 'node:path';
import {
  startFixtureServer,
  type FixtureRoute,
  type FixtureServer,
} from '../../test-utils/fixture-server.js';
import { evalFixtureBaseCssPath, evalRoot, resolveEvalPath } from '../manifest.js';
import type { RepairWorkspace, WorkspaceVariant } from '../repair-workspace.js';
import type { EvalManifest, FixtureVariant } from '../types.js';

export interface EvalFixtureServer extends FixtureServer {
  fontUrl: string;
  perturbationReferenceUrls: ReadonlyMap<string, string>;
  referenceUrl: string;
  workspaceImplementationUrl: string;
  workspacePerturbationUrls: ReadonlyMap<string, string>;
}

function routePath(relativePath: string): string {
  return `/${relativePath.replace(/^fixtures\//, '')}`;
}

function addVariantRoutes(routes: Map<string, FixtureRoute>, variant: FixtureVariant): void {
  routes.set(routePath(variant.html), {
    contentType: 'text/html; charset=utf-8',
    filePath: resolveEvalPath(variant.html),
  });
  routes.set(routePath(variant.css), {
    contentType: 'text/css; charset=utf-8',
    filePath: resolveEvalPath(variant.css),
  });
}

function addWorkspaceVariantRoutes(
  routes: Map<string, FixtureRoute>,
  routePrefix: string,
  variant: WorkspaceVariant
): void {
  routes.set(`${routePrefix}/index.html`, {
    contentType: 'text/html; charset=utf-8',
    filePath: variant.htmlPath,
  });
  routes.set(`${routePrefix}/styles.css`, {
    contentType: 'text/css; charset=utf-8',
    filePath: variant.cssPath,
  });
}

export async function startEvalFixtureServer(
  manifest: EvalManifest,
  workspace: RepairWorkspace
): Promise<EvalFixtureServer> {
  const routes = new Map<string, FixtureRoute>();
  addVariantRoutes(routes, manifest.reference);
  // Candidates are deliberately not routed: they reach the browser only as workspace copies, so
  // what renders is always the proposal-applied file.
  for (const perturbation of manifest.perturbations) {
    addVariantRoutes(routes, perturbation.reference);
  }
  addWorkspaceVariantRoutes(routes, '/workspace/current', workspace.implementation);
  for (const [id, variant] of workspace.perturbations) {
    addWorkspaceVariantRoutes(routes, `/workspace/perturbations/${id}`, variant);
  }

  routes.set(`/${manifest.fixtureId}/base.css`, {
    contentType: 'text/css; charset=utf-8',
    filePath: evalFixtureBaseCssPath(manifest.fixtureId),
  });
  routes.set('/workspace/base.css', {
    contentType: 'text/css; charset=utf-8',
    filePath: workspace.baseCssPath,
  });
  const fontPath = join(
    resolve(evalRoot, '..'),
    'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'
  );
  routes.set('/fonts/inter-latin-wght-normal.woff2', {
    contentType: 'font/woff2',
    filePath: fontPath,
  });

  const server = await startFixtureServer(routes);
  return {
    ...server,
    fontUrl: `${server.origin}/fonts/inter-latin-wght-normal.woff2`,
    perturbationReferenceUrls: new Map(
      manifest.perturbations.map((perturbation) => [
        perturbation.id,
        `${server.origin}${routePath(perturbation.reference.html)}`,
      ])
    ),
    referenceUrl: `${server.origin}${routePath(manifest.reference.html)}`,
    workspaceImplementationUrl: `${server.origin}/workspace/current/index.html`,
    workspacePerturbationUrls: new Map(
      [...workspace.perturbations].map(([id]) => [
        id,
        `${server.origin}/workspace/perturbations/${id}/index.html`,
      ])
    ),
  };
}
