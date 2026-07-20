import { access, readFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  evalIdentifierPattern,
  type EvalManifest,
  type EvalMutation,
  type EvalPerturbation,
  type ExpectedMetadata,
  type FixtureRootDimensionConstraint,
  type FixtureSizingMode,
  type FixtureVariant,
  type RepairChange,
  type RootCause,
} from './types.js';

export const evalRoot = resolve(import.meta.dirname);
export const defaultEvalFixtureId = 'atomic-button';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean`);
  }
  return value;
}

function asIdentifier(value: unknown, label: string): string {
  const parsed = asString(value, label);
  if (!evalIdentifierPattern.test(parsed)) {
    throw new TypeError(`${label} must be a safe eval identifier`);
  }
  return parsed;
}

function asNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function asNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
  return value;
}

function asPositiveInteger(value: unknown, label: string): number {
  const parsed = asNonNegativeInteger(value, label);
  if (parsed === 0) throw new TypeError(`${label} must be positive`);
  return parsed;
}

function parseVariant(value: unknown, label: string): FixtureVariant {
  const record = asRecord(value, label);
  return {
    css: asString(record.css, `${label}.css`),
    html: asString(record.html, `${label}.html`),
  };
}

function parseRepairChange(value: unknown, label: string): RepairChange {
  const record = asRecord(value, label);
  return {
    property: asString(record.property, `${label}.property`),
    selector: asString(record.selector, `${label}.selector`),
    value: asString(record.value, `${label}.value`),
  };
}

function parseRootCause(value: unknown, label: string): RootCause {
  const record = asRecord(value, label);
  const acceptedRepairs = asArray(record.acceptedRepairs, `${label}.acceptedRepairs`).map(
    (repair, repairIndex) => {
      const changes = asArray(repair, `${label}.acceptedRepairs[${repairIndex}]`).map(
        (change, changeIndex) =>
          parseRepairChange(change, `${label}.acceptedRepairs[${repairIndex}][${changeIndex}]`)
      );
      if (changes.length === 0) {
        throw new TypeError(`${label}.acceptedRepairs[${repairIndex}] must not be empty`);
      }
      return changes;
    }
  );
  if (acceptedRepairs.length === 0) {
    throw new TypeError(`${label}.acceptedRepairs must not be empty`);
  }

  return {
    acceptedRepairs,
    description: asString(record.description, `${label}.description`),
  };
}

function parseMutation(
  value: unknown,
  index: number,
  perturbations: readonly EvalPerturbation[]
): EvalMutation {
  const label = `manifest.mutations[${index}]`;
  const record = asRecord(value, label);
  return {
    ...parseVariant(record, label),
    candidates: parseCandidates(record.candidates, `${label}.candidates`, perturbations),
    id: asIdentifier(record.id, `${label}.id`),
    rootCause: parseRootCause(record.rootCause, `${label}.rootCause`),
  };
}

// CSS only, with no fallback: markup must match the oracle's for the comparison to mean anything,
// and a CSS fallback would reintroduce the blind spot described on EvalPerturbation.
function parseCandidates(
  value: unknown,
  label: string,
  perturbations: readonly EvalPerturbation[]
): ReadonlyMap<string, FixtureVariant> {
  const record = asRecord(value, label);
  const candidates = new Map<string, FixtureVariant>();
  for (const perturbation of perturbations) {
    const entryLabel = `${label}.${perturbation.id}`;
    const entry = asRecord(record[perturbation.id], entryLabel);
    const extraKeys = Object.keys(entry).filter((key) => key !== 'css');
    if (extraKeys.length > 0) {
      throw new TypeError(`${entryLabel} has unexpected fields: ${extraKeys.join(', ')}`);
    }
    candidates.set(perturbation.id, {
      css: asString(entry.css, `${entryLabel}.css`),
      html: perturbation.reference.html,
    });
  }
  const unknown = Object.keys(record).filter((id) => !candidates.has(id));
  if (unknown.length > 0) {
    throw new TypeError(
      `${label} declares candidates for unknown perturbations: ${unknown.join(', ')}`
    );
  }
  return candidates;
}

function parsePerturbation(value: unknown, index: number): EvalPerturbation {
  const label = `manifest.perturbations[${index}]`;
  const record = asRecord(value, label);
  return {
    expectedMetadata: parseExpectedMetadata(record.expectedMetadata, `${label}.expectedMetadata`),
    id: asIdentifier(record.id, `${label}.id`),
    reference: parseVariant(record.reference, `${label}.reference`),
  };
}

function parseExpectedMetadata(
  value: unknown,
  label = 'manifest.reference.expectedMetadata'
): ExpectedMetadata {
  const record = asRecord(value, label);
  const padding = asArray(record.padding, `${label}.padding`).map((entry, index) =>
    asNonNegativeNumber(entry, `${label}.padding[${index}]`)
  );
  if (padding.length !== 4) {
    throw new TypeError(`${label}.padding must contain four values`);
  }

  return {
    childCount: asNonNegativeInteger(record.childCount, `${label}.childCount`),
    height: asNonNegativeNumber(record.height, `${label}.height`),
    overflowing: asBoolean(record.overflowing, `${label}.overflowing`),
    padding: [padding[0] ?? 0, padding[1] ?? 0, padding[2] ?? 0, padding[3] ?? 0],
    scrollHeight: asNonNegativeInteger(record.scrollHeight, `${label}.scrollHeight`),
    scrollWidth: asNonNegativeInteger(record.scrollWidth, `${label}.scrollWidth`),
    width: asNonNegativeNumber(record.width, `${label}.width`),
  };
}

function parseExpectedSpec(value: unknown): Record<string, Partial<Record<string, string>>> {
  const record = asRecord(value, 'manifest.reference.expectedSpec');
  return Object.fromEntries(
    Object.entries(record).map(([selector, properties]) => {
      const propertyRecord = asRecord(
        properties,
        `manifest.reference.expectedSpec[${JSON.stringify(selector)}]`
      );
      return [
        selector,
        Object.fromEntries(
          Object.entries(propertyRecord).map(([property, expected]) => [
            property,
            asString(
              expected,
              `manifest.reference.expectedSpec[${JSON.stringify(selector)}].${property}`
            ),
          ])
        ),
      ];
    })
  );
}

function parseSizingMode(value: unknown, label: string): FixtureSizingMode {
  const mode = asString(value, label);
  if (mode !== 'FIXED' && mode !== 'HUG' && mode !== 'FILL') {
    throw new TypeError(`${label} must be FIXED, HUG, or FILL`);
  }
  return mode;
}

function parseRootDimensionConstraints(
  value: unknown,
  metadata: ExpectedMetadata
): FixtureRootDimensionConstraint[] {
  const sizing = asRecord(value, 'manifest.reference.sizing');
  const keys = Object.keys(sizing);
  if (keys.length !== 2 || !keys.includes('horizontal') || !keys.includes('vertical')) {
    throw new TypeError('manifest.reference.sizing must define horizontal and vertical only');
  }
  return [
    {
      axis: 'horizontal',
      mode: parseSizingMode(sizing.horizontal, 'manifest.reference.sizing.horizontal'),
      observedPx: metadata.width,
      source: 'fixture-contract',
    },
    {
      axis: 'vertical',
      mode: parseSizingMode(sizing.vertical, 'manifest.reference.sizing.vertical'),
      observedPx: metadata.height,
      source: 'fixture-contract',
    },
  ];
}

export function resolveEvalPath(relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new RangeError(`Eval paths must be relative: ${relativePath}`);
  }
  const resolved = resolve(evalRoot, relativePath);
  const offset = relative(evalRoot, resolved);
  if (offset === '..' || offset.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new RangeError(`Eval path must stay inside evals/: ${relativePath}`);
  }
  return resolved;
}

export function evalFixtureRoot(fixtureId: string): string {
  if (!evalIdentifierPattern.test(fixtureId)) {
    throw new RangeError(`Invalid eval fixture ID: ${fixtureId}`);
  }
  return resolve(evalRoot, 'fixtures', fixtureId);
}

export function evalFixtureBaseCssPath(fixtureId: string): string {
  return resolve(evalFixtureRoot(fixtureId), 'base.css');
}

function pathIsWithin(root: string, target: string): boolean {
  const offset = relative(root, target);
  return (
    offset === '' || (!isAbsolute(offset) && offset !== '..' && !offset.startsWith(`..${sep}`))
  );
}

async function verifyFixtureFiles(manifest: EvalManifest): Promise<void> {
  const fixtureRoot = evalFixtureRoot(manifest.fixtureId);
  const variants: FixtureVariant[] = [
    manifest.reference,
    ...manifest.mutations.flatMap((mutation) => [mutation, ...mutation.candidates.values()]),
    ...manifest.perturbations.map((perturbation) => perturbation.reference),
  ];
  for (const variant of variants) {
    for (const file of [variant.html, variant.css]) {
      if (!pathIsWithin(fixtureRoot, resolveEvalPath(file))) {
        throw new RangeError(
          `Fixture ${manifest.fixtureId} path must stay inside its fixture directory: ${file}`
        );
      }
    }
  }
  await Promise.all(
    [
      evalFixtureBaseCssPath(manifest.fixtureId),
      ...variants.flatMap((variant) =>
        [variant.html, variant.css].map((file) => resolveEvalPath(file))
      ),
    ].map(async (file) => await access(file))
  );
}

export async function loadManifest(
  manifestPath = resolve(evalRoot, 'manifests', `${defaultEvalFixtureId}.json`)
): Promise<EvalManifest> {
  const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  const record = asRecord(parsed, 'manifest');
  if (record.schemaVersion !== 4) {
    throw new TypeError('manifest.schemaVersion must be 4');
  }

  const referenceRecord = asRecord(record.reference, 'manifest.reference');
  const referenceMetadata = parseExpectedMetadata(referenceRecord.expectedMetadata);
  const viewportRecord = asRecord(record.viewport, 'manifest.viewport');
  const editableSelectors = asArray(record.editableSelectors, 'manifest.editableSelectors').map(
    (selector, index) => asString(selector, `manifest.editableSelectors[${index}]`)
  );
  if (
    editableSelectors.length === 0 ||
    new Set(editableSelectors).size !== editableSelectors.length
  ) {
    throw new TypeError('manifest.editableSelectors must contain unique selectors');
  }
  // Perturbations parse first because every mutation must supply a candidate for each of them.
  const perturbations = asArray(record.perturbations, 'manifest.perturbations').map(
    parsePerturbation
  );
  const manifest: EvalManifest = {
    editableSelectors,
    fixtureId: asIdentifier(record.fixtureId, 'manifest.fixtureId'),
    mutations: asArray(record.mutations, 'manifest.mutations').map((value, index) =>
      parseMutation(value, index, perturbations)
    ),
    perturbations,
    reference: {
      ...parseVariant(referenceRecord, 'manifest.reference'),
      expectedMetadata: referenceMetadata,
      expectedSpec: parseExpectedSpec(referenceRecord.expectedSpec),
      rootDimensionConstraints: parseRootDimensionConstraints(
        referenceRecord.sizing,
        referenceMetadata
      ),
    },
    schemaVersion: 4,
    selector: asString(record.selector, 'manifest.selector'),
    viewport: {
      height: asPositiveInteger(viewportRecord.height, 'manifest.viewport.height'),
      width: asPositiveInteger(viewportRecord.width, 'manifest.viewport.width'),
    },
  };
  if (basename(manifestPath, '.json') !== manifest.fixtureId) {
    throw new TypeError('manifest filename must match manifest.fixtureId');
  }
  if (manifest.mutations.length === 0) {
    throw new TypeError('manifest.mutations must not be empty');
  }
  if (manifest.perturbations.length === 0) {
    throw new TypeError('manifest.perturbations must not be empty');
  }
  const variantIds = [...manifest.mutations, ...manifest.perturbations].map(({ id }) => id);
  if (new Set(variantIds).size !== variantIds.length) {
    throw new TypeError('manifest mutation and perturbation IDs must be unique');
  }

  await verifyFixtureFiles(manifest);
  return manifest;
}

export async function loadManifestById(fixtureId: string): Promise<EvalManifest> {
  if (!evalIdentifierPattern.test(fixtureId)) {
    throw new RangeError(`Invalid eval fixture ID: ${fixtureId}`);
  }
  return await loadManifest(resolve(evalRoot, 'manifests', `${fixtureId}.json`));
}
