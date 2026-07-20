import { parse } from 'postcss';
import type { ComparisonSnapshot, ConditionFeedback, RootDimensionConstraint } from '../types.js';
import { buildScalarFeedback } from './scalar.js';

type DiffActionability = 'diagnostic-only' | 'repair-candidate';
type DiffProvenance =
  | 'authored-computed-style'
  | 'computed-observation'
  | 'derived-geometry'
  | 'explicit-design-constraint';

export interface TypedPropertyDiff {
  actionability: DiffActionability;
  actual?: string;
  dimensionConstraint?: RootDimensionConstraint;
  expected?: string;
  property: string;
  provenance: DiffProvenance;
  sourceDeclaration?: string;
}

interface TypedStyleDiff {
  isRoot?: boolean;
  properties: TypedPropertyDiff[];
  selector: string;
  severity: 'high' | 'low' | 'medium';
}

export type TypedDimensionSignal = RootDimensionConstraint & {
  actionability: DiffActionability;
  actualPx?: number;
  property: 'height' | 'width';
};

export interface TypedDiffEvidence {
  dimensionConstraints: TypedDimensionSignal[];
  styleDiffs: TypedStyleDiff[];
}

const derivedGeometryProperties = new Set(['height', 'width']);

function declaredPropertiesBySelector(sourceCss: string): ReadonlyMap<string, ReadonlySet<string>> {
  const propertiesBySelector = new Map<string, Set<string>>();
  const root = parse(sourceCss, { from: undefined });
  root.walkRules((rule) => {
    const declarations = rule.nodes
      .filter((node) => node.type === 'decl')
      .map((declaration) => declaration.prop.toLowerCase());
    for (const selector of rule.selectors) {
      const normalizedSelector = selector.trim();
      const properties = propertiesBySelector.get(normalizedSelector) ?? new Set<string>();
      declarations.forEach((property) => properties.add(property));
      propertiesBySelector.set(normalizedSelector, properties);
    }
  });
  return propertiesBySelector;
}

function sourceDeclarationForProperty(
  declaredProperties: ReadonlySet<string>,
  property: string
): string | undefined {
  if (declaredProperties.has(property)) return property;
  if (property.startsWith('padding-') && declaredProperties.has('padding')) return 'padding';
  return undefined;
}

function dimensionProperty(axis: RootDimensionConstraint['axis']): 'height' | 'width' {
  return axis === 'horizontal' ? 'width' : 'height';
}

function dimensionIsExplicitFixed(constraint: RootDimensionConstraint): boolean {
  return (
    constraint.mode === 'FIXED' &&
    (constraint.source === 'fixture-contract' ||
      constraint.source === 'layout-sizing' ||
      constraint.source === 'legacy-axis-sizing')
  );
}

function constraintByProperty(
  constraints: readonly RootDimensionConstraint[]
): ReadonlyMap<string, RootDimensionConstraint> {
  return new Map(constraints.map((constraint) => [dimensionProperty(constraint.axis), constraint]));
}

export function buildTypedStyleDiffs(
  comparison: ComparisonSnapshot,
  rootSelector: string,
  sourceCss: string,
  dimensionConstraints: readonly RootDimensionConstraint[]
): TypedStyleDiff[] {
  const propertiesBySelector = declaredPropertiesBySelector(sourceCss);
  const dimensions = constraintByProperty(dimensionConstraints);
  return comparison.styleDiffs.map((styleDiff) => {
    const selector = styleDiff.isRoot === true ? rootSelector : styleDiff.selector;
    const declaredProperties = propertiesBySelector.get(selector) ?? new Set<string>();
    return {
      ...(styleDiff.isRoot === undefined ? {} : { isRoot: styleDiff.isRoot }),
      properties: Object.entries(styleDiff.properties).map(([property, values]) => {
        const sourceDeclaration = sourceDeclarationForProperty(declaredProperties, property);
        const dimension = styleDiff.isRoot === true ? dimensions.get(property) : undefined;
        const actionability =
          sourceDeclaration || (dimension && dimensionIsExplicitFixed(dimension))
            ? 'repair-candidate'
            : 'diagnostic-only';
        const provenance: DiffProvenance = sourceDeclaration
          ? 'authored-computed-style'
          : dimension && dimensionIsExplicitFixed(dimension)
            ? 'explicit-design-constraint'
            : dimension || derivedGeometryProperties.has(property)
              ? 'derived-geometry'
              : 'computed-observation';
        return {
          actionability,
          ...(values.actual === undefined ? {} : { actual: values.actual }),
          ...(dimension ? { dimensionConstraint: dimension } : {}),
          ...(values.expected === undefined ? {} : { expected: values.expected }),
          property,
          provenance,
          ...(sourceDeclaration ? { sourceDeclaration } : {}),
        };
      }),
      selector,
      severity: styleDiff.severity,
    };
  });
}

export function buildTypedDiffEvidence(
  comparison: ComparisonSnapshot,
  rootSelector: string,
  sourceCss: string,
  dimensionConstraints: readonly RootDimensionConstraint[]
): TypedDiffEvidence {
  return {
    dimensionConstraints: dimensionConstraints.map((constraint) => {
      const property = dimensionProperty(constraint.axis);
      const actualPx = comparison.dimensions?.impl[property];
      return {
        ...constraint,
        actionability: dimensionIsExplicitFixed(constraint)
          ? 'repair-candidate'
          : 'diagnostic-only',
        ...(actualPx === undefined ? {} : { actualPx }),
        property,
      };
    }),
    styleDiffs: buildTypedStyleDiffs(comparison, rootSelector, sourceCss, dimensionConstraints),
  };
}

export function buildTypedDiffFeedback(
  comparison: ComparisonSnapshot,
  rootSelector: string,
  sourceCss: string,
  dimensionConstraints: readonly RootDimensionConstraint[]
): ConditionFeedback {
  const feedback = buildScalarFeedback(comparison);
  const evidence = buildTypedDiffEvidence(
    comparison,
    rootSelector,
    sourceCss,
    dimensionConstraints
  );
  return {
    ...feedback,
    text: `${feedback.text}\nuiMatch typed evidence:\n${JSON.stringify(evidence, null, 2)}\nA repair-candidate is either an authored declaration or an explicit source constraint. A diagnostic-only dimension is an observed result of HUG, FILL, or unknown sizing, not evidence that a fixed dimension should be declared.`,
  };
}
