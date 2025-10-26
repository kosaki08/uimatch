/**
 * Style difference calculation
 */

import type { ExpectedSpec, PatchHint, StyleDiff, TokenMap } from '../types/index';
import { deltaE2000 } from '../utils/color';
import {
  normLineHeight,
  parseBoxShadow,
  parseCssColorToRgb,
  toPx,
  type RGB,
} from '../utils/normalize';

export interface DiffOptions {
  thresholds?: {
    deltaE?: number;
  };
  ignore?: string[];
  weights?: Partial<
    Record<'color' | 'spacing' | 'radius' | 'border' | 'shadow' | 'typography', number>
  >;
  tokens?: TokenMap;
}

/**
 * Build style differences between actual and expected styles
 * @param actual Actual styles captured from implementation
 * @param expectedSpec Expected style specification
 * @param opts Diff options (thresholds, ignore, weights, tokens)
 * @returns Array of style differences
 */
export function buildStyleDiffs(
  actual: Record<string, Record<string, string>>,
  expectedSpec: ExpectedSpec,
  opts: DiffOptions = {}
): StyleDiff[] {
  const diffs: StyleDiff[] = [];
  const ignore = new Set(opts.ignore ?? []);
  const tDeltaE = opts.thresholds?.deltaE ?? 3.0;

  const categoriesOf = (
    prop: string
  ): Array<'color' | 'spacing' | 'radius' | 'border' | 'shadow' | 'typography'> => {
    if (/^font-/.test(prop) || prop === 'line-height' || prop === 'font-weight')
      return ['typography'];
    if (prop === 'color' || prop === 'background-color' || prop === 'border-color')
      return ['color'];
    if (prop === 'border-radius') return ['radius'];
    if (prop === 'border-width') return ['border'];
    if (prop === 'box-shadow') return ['shadow'];
    if (prop.startsWith('padding') || prop === 'gap') return ['spacing'];
    return ['typography'];
  };

  for (const [sel, props] of Object.entries(actual)) {
    const exp = expectedSpec[sel] ?? expectedSpec['__self__'] ?? {};
    const propDiffs: Record<
      string,
      {
        actual?: string;
        expected?: string;
        expectedToken?: string;
        delta?: number;
        unit?: string;
      }
    > = {};
    let severity: 'low' | 'medium' | 'high' = 'low';

    const consider = (
      prop: string,
      compare: () => {
        ok: boolean;
        delta?: number;
        unit?: string;
        expected?: string;
        expectedToken?: string;
      }
    ) => {
      if (ignore.has(prop)) return;
      const r = compare();
      propDiffs[prop] = {
        actual: props[prop],
        expected: r.expected,
        expectedToken: r.expectedToken,
        delta: r.delta,
        unit: r.unit,
      };
      if (!r.ok) {
        const cat = categoriesOf(prop)[0];
        if (cat === 'color' && (r.delta ?? 0) > 2 * tDeltaE) severity = 'high';
        else if (severity !== 'high') severity = 'medium';
      }
    };

    // font-size
    consider('font-size', () => {
      const a = toPx(props['font-size']);
      const e = exp['font-size'] ? toPx(exp['font-size']) : undefined;
      if (e == null || a == null) return { ok: true };
      const tol = Math.max(1, 0.08 * e);
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // line-height
    consider('line-height', () => {
      const fs = toPx(props['font-size']) ?? 16;
      const a = normLineHeight(props['line-height'], fs);
      const e = exp['line-height'] ? normLineHeight(exp['line-height'], fs) : undefined;
      if (e == null || a == null) return { ok: true };
      const tol = Math.max(1, 0.1 * e);
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // font-weight
    consider('font-weight', () => {
      const parseW = (v?: string) =>
        v ? (v === 'bold' ? 700 : v === 'normal' ? 400 : parseInt(v, 10)) : undefined;
      const a = parseW(props['font-weight']);
      const e = exp['font-weight'] ? parseW(exp['font-weight']) : undefined;
      if (e == null || a == null) return { ok: true };
      const d = Math.abs(a - e);
      return { ok: d < 200, delta: a - e, expected: String(e) };
    });

    // colors (color, background-color, border-color)
    (['color', 'background-color', 'border-color'] as const).forEach((p) => {
      consider(p, () => {
        const aRgb = parseCssColorToRgb(props[p]);
        const ref = exp[p];
        if (!aRgb || !ref) return { ok: true };
        let expectedToken: string | undefined;
        let eRgb: RGB | undefined = parseCssColorToRgb(ref);

        // TokenMap lookup (expected is var(--x))
        if (!eRgb && ref.startsWith('var(') && opts.tokens?.color) {
          const tokenName = ref.slice(4, -1).trim(); // --x
          const hex = opts.tokens.color[tokenName];
          if (hex) {
            eRgb = parseCssColorToRgb(hex);
            expectedToken = tokenName;
          }
        }
        if (!eRgb) return { ok: true };

        const dE = deltaE2000(aRgb, eRgb);
        return {
          ok: dE <= tDeltaE,
          delta: +dE.toFixed(2),
          unit: 'ΔE',
          expected: ref,
          expectedToken,
        };
      });
    });

    // radius
    consider('border-radius', () => {
      const a = toPx(props['border-radius']);
      const e = exp['border-radius'] ? toPx(exp['border-radius']) : undefined;
      if (e == null || a == null) return { ok: true };
      const tol = Math.max(1, 0.12 * e);
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // border-width
    consider('border-width', () => {
      const a = toPx(props['border-width']);
      const e = exp['border-width'] ? toPx(exp['border-width']) : undefined;
      if (e == null || a == null) return { ok: true };
      const tol = Math.max(1, 0.3 * e);
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // spacing
    (['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap'] as const).forEach(
      (p) => {
        consider(p, () => {
          const a = toPx(props[p]);
          const e = exp[p] ? toPx(exp[p]) : undefined;
          if (e == null || a == null) return { ok: true };
          const tol = Math.max(1, 0.15 * e);
          return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
        });
      }
    );

    // shadow (blur and color only)
    consider('box-shadow', () => {
      const a = parseBoxShadow(props['box-shadow']);
      const e = exp['box-shadow'] ? parseBoxShadow(exp['box-shadow']) : undefined;
      if (!a || !e) return { ok: true };
      const okBlur = Math.abs(a.blur - e.blur) <= Math.max(1, 0.15 * e.blur);
      const dE = a.rgb && e.rgb ? deltaE2000(a.rgb, e.rgb) : 0;
      const okColor = dE <= tDeltaE + 1.0;
      return {
        ok: okBlur && okColor,
        delta: dE,
        unit: 'ΔE',
        expected: exp['box-shadow'],
      };
    });

    // Generate patch hints
    const patchHints = generatePatchHints(propDiffs);

    diffs.push({
      path: sel === '__self__' ? 'self' : sel,
      selector: sel,
      properties: propDiffs,
      severity,
      patchHints,
    });
  }

  return diffs;
}

/**
 * Generate patch hints for style differences
 * @param propDiffs Property-level differences
 * @returns Array of patch hints
 */
function generatePatchHints(
  propDiffs: Record<
    string,
    {
      actual?: string;
      expected?: string;
      expectedToken?: string;
      delta?: number;
      unit?: string;
    }
  >
): PatchHint[] {
  const hints: PatchHint[] = [];

  for (const [prop, diff] of Object.entries(propDiffs)) {
    if (!diff.expected || !diff.delta) continue;

    // Determine severity based on delta and unit
    let severity: 'low' | 'medium' | 'high' = 'low';
    if (diff.unit === 'ΔE') {
      if (diff.delta > 6) severity = 'high';
      else if (diff.delta > 3) severity = 'medium';
    } else if (diff.unit === 'px') {
      if (Math.abs(diff.delta) > 4) severity = 'medium';
      if (Math.abs(diff.delta) > 8) severity = 'high';
    }

    // Color properties with token
    if (diff.expectedToken && ['color', 'background-color', 'border-color'].includes(prop)) {
      hints.push({
        property: prop,
        suggestedValue: `var(${diff.expectedToken})`,
        severity,
      });
      continue;
    }

    // Generic hint
    if (diff.expected) {
      hints.push({
        property: prop,
        suggestedValue: diff.expected,
        severity,
      });
    }
  }

  return hints;
}
