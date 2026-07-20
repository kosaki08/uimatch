import { parse } from 'postcss';
import type { ComparisonSnapshot, ConditionFeedback } from '../types.js';
import { buildScalarFeedback } from './scalar.js';

type DiffActionability = 'diagnostic-only' | 'repair-candidate';
type DiffProvenance = 'authored-computed-style' | 'computed-observation' | 'derived-geometry';

export interface TypedPropertyDiff {
  actionability: DiffActionability;
  actual?: string;
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

export function buildTypedStyleDiffs(
  comparison: ComparisonSnapshot,
  rootSelector: string,
  sourceCss: string
): TypedStyleDiff[] {
  const propertiesBySelector = declaredPropertiesBySelector(sourceCss);
  return comparison.styleDiffs.map((styleDiff) => {
    const selector = styleDiff.isRoot === true ? rootSelector : styleDiff.selector;
    const declaredProperties = propertiesBySelector.get(selector) ?? new Set<string>();
    return {
      ...(styleDiff.isRoot === undefined ? {} : { isRoot: styleDiff.isRoot }),
      properties: Object.entries(styleDiff.properties).map(([property, values]) => {
        const sourceDeclaration = sourceDeclarationForProperty(declaredProperties, property);
        const provenance: DiffProvenance = sourceDeclaration
          ? 'authored-computed-style'
          : derivedGeometryProperties.has(property)
            ? 'derived-geometry'
            : 'computed-observation';
        return {
          actionability: sourceDeclaration ? 'repair-candidate' : 'diagnostic-only',
          ...(values.actual === undefined ? {} : { actual: values.actual }),
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

export function buildTypedDiffFeedback(
  comparison: ComparisonSnapshot,
  rootSelector: string,
  sourceCss: string
): ConditionFeedback {
  const feedback = buildScalarFeedback(comparison);
  const styleDiffs = buildTypedStyleDiffs(comparison, rootSelector, sourceCss);
  return {
    ...feedback,
    text: `${feedback.text}\nuiMatch typed styleDiffs:\n${JSON.stringify(styleDiffs, null, 2)}\nA repair-candidate maps to a declaration authored in the current CSS. A diagnostic-only value is an observation, not evidence that the property should be declared.`,
  };
}
