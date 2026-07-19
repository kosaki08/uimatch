import { join, resolve } from 'node:path';
import {
  startFixtureServer,
  type FixtureRoute,
  type FixtureServer,
} from '../../test-utils/fixture-server.js';
import { evalRoot, resolveEvalPath } from '../manifest.js';
import type { EvalManifest, FixtureVariant } from '../types.js';

export interface EvalFixtureServer extends FixtureServer {
  fontUrl: string;
  mutationUrls: ReadonlyMap<string, string>;
  perturbationUrls: ReadonlyMap<string, string>;
  referenceUrl: string;
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

export async function startEvalFixtureServer(manifest: EvalManifest): Promise<EvalFixtureServer> {
  const routes = new Map<string, FixtureRoute>();
  addVariantRoutes(routes, manifest.reference);
  for (const mutation of manifest.mutations) addVariantRoutes(routes, mutation);
  for (const perturbation of manifest.perturbations) addVariantRoutes(routes, perturbation);

  routes.set(`/${manifest.fixtureId}/base.css`, {
    contentType: 'text/css; charset=utf-8',
    filePath: resolve(evalRoot, 'fixtures', manifest.fixtureId, 'base.css'),
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
    mutationUrls: new Map(
      manifest.mutations.map((mutation) => [
        mutation.id,
        `${server.origin}${routePath(mutation.html)}`,
      ])
    ),
    perturbationUrls: new Map(
      manifest.perturbations.map((perturbation) => [
        perturbation.id,
        `${server.origin}${routePath(perturbation.html)}`,
      ])
    ),
    referenceUrl: `${server.origin}${routePath(manifest.reference.html)}`,
  };
}
