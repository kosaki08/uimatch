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
    /**
     * Maximum acceptable color Delta E (CIEDE2000).
     * @default 3.0
     */
    deltaE?: number;
    /**
     * Tolerance ratio for spacing properties (padding, margin).
     * @default 0.15 (15%)
     */
    spacing?: number;
    /**
     * Tolerance ratio for dimension properties (width, height).
     * @default 0.05 (5%)
     */
    dimension?: number;
    /**
     * Tolerance ratio for gap properties (gap, column-gap, row-gap).
     * @default 0.1 (10%)
     */
    layoutGap?: number;
    /**
     * Tolerance ratio for border-radius.
     * @default 0.12 (12%)
     */
    radius?: number;
    /**
     * Tolerance ratio for border-width.
     * @default 0.3 (30%)
     */
    borderWidth?: number;
    /**
     * Tolerance ratio for box-shadow blur.
     * @default 0.15 (15%)
     */
    shadowBlur?: number;
    /**
     * Extra Delta E tolerance for box-shadow color comparison.
     * @default 1.0
     */
    shadowColorExtraDE?: number;
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

  // Extract thresholds with defaults
  const tDeltaE = opts.thresholds?.deltaE ?? 3.0;
  const tSpacing = opts.thresholds?.spacing ?? 0.15;
  const tDimension = opts.thresholds?.dimension ?? 0.05;
  const tLayoutGap = opts.thresholds?.layoutGap ?? 0.1;
  const tRadius = opts.thresholds?.radius ?? 0.12;
  const tBorderWidth = opts.thresholds?.borderWidth ?? 0.3;
  const tShadowBlur = opts.thresholds?.shadowBlur ?? 0.15;
  const tShadowColorExtra = opts.thresholds?.shadowColorExtraDE ?? 1.0;

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
    if (
      prop.startsWith('padding') ||
      prop.startsWith('margin') ||
      prop === 'gap' ||
      prop === 'column-gap' ||
      prop === 'row-gap'
    )
      return ['spacing'];
    return ['typography'];
  };

  for (const [sel, props] of Object.entries(actual)) {
    // Only compare if selector is explicitly defined in expectedSpec
    // Fallback to __self__ only for __self__ selector to avoid false positives
    const exp = expectedSpec[sel] ?? (sel === '__self__' ? (expectedSpec['__self__'] ?? {}) : {});
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

    // width / height
    (['width', 'height'] as const).forEach((p) => {
      consider(p, () => {
        const a = toPx(props[p]);
        const e = exp[p] ? toPx(exp[p]) : undefined;
        if (e == null || a == null) return { ok: true };
        const tol = Math.max(1, tDimension * e);
        return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
      });
    });

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
      const tol = Math.max(1, tRadius * e);
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // border-width
    consider('border-width', () => {
      const a = toPx(props['border-width']);
      const e = exp['border-width'] ? toPx(exp['border-width']) : undefined;
      if (e == null || a == null) return { ok: true };
      const tol = Math.max(1, tBorderWidth * e);
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // border-style
    consider('border-style', () => {
      const a = props['border-style']?.trim();
      const e = exp['border-style']?.trim();
      if (!e || !a) return { ok: true };
      return { ok: a === e, expected: e };
    });

    // spacing (padding and margin properties)
    (
      [
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
      ] as const
    ).forEach((p) => {
      consider(p, () => {
        const a = toPx(props[p]);
        const e = exp[p] ? toPx(exp[p]) : undefined;
        if (e == null || a == null) return { ok: true };
        const tol = Math.max(1, tSpacing * e);
        return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
      });
    });

    // gap, column-gap, row-gap (configurable tolerance for AA/subpixel errors)
    // 'normal' → 0px for flex default
    const toGapPx = (v?: string) => (v?.trim() === 'normal' ? 0 : toPx(v));
    (['gap', 'column-gap', 'row-gap'] as const).forEach((p) => {
      consider(p, () => {
        const a = toGapPx(props[p]);
        const e = exp[p] ? toGapPx(exp[p]) : undefined;
        if (e == null || a == null) return { ok: true };
        const tol = Math.max(1, tLayoutGap * e);
        return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
      });
    });

    // shadow (blur, color, and offset)
    consider('box-shadow', () => {
      const a = parseBoxShadow(props['box-shadow']);
      const e = exp['box-shadow'] ? parseBoxShadow(exp['box-shadow']) : undefined;
      if (!a || !e) return { ok: true };
      const okBlur = Math.abs(a.blur - e.blur) <= Math.max(1, tShadowBlur * e.blur);
      const dE = a.rgb && e.rgb ? deltaE2000(a.rgb, e.rgb) : 0;
      const okColor = dE <= tDeltaE + tShadowColorExtra;

      // Extract offset (offsetX/offsetY) from shadow value (supports inset)
      const takeOffset = (v?: string) => {
        if (!v || v === 'none') return { x: undefined, y: undefined };
        const m = v.trim().match(/^(?:inset\s+)?([+-]?\d+(?:\.\d+)?px)\s+([+-]?\d+(?:\.\d+)?px)/);
        return {
          x: m?.[1] ? toPx(m[1]) : undefined,
          y: m?.[2] ? toPx(m[2]) : undefined,
        };
      };
      const ao = takeOffset(props['box-shadow']);
      const eo = takeOffset(exp['box-shadow'] as string);
      const okOffset =
        (ao.x == null || eo.x == null || Math.abs(ao.x - eo.x) <= 1) &&
        (ao.y == null || eo.y == null || Math.abs(ao.y - eo.y) <= 1);

      // If offset differs, add auxiliary information
      if (!okOffset) {
        if (ao.x != null || eo.x != null) {
          propDiffs['box-shadow-offset-x'] = {
            actual: ao.x != null ? `${ao.x}px` : undefined,
            expected: eo.x != null ? `${eo.x}px` : undefined,
            delta: ao.x != null && eo.x != null ? ao.x - eo.x : undefined,
            unit: 'px',
          };
        }
        if (ao.y != null || eo.y != null) {
          propDiffs['box-shadow-offset-y'] = {
            actual: ao.y != null ? `${ao.y}px` : undefined,
            expected: eo.y != null ? `${eo.y}px` : undefined,
            delta: ao.y != null && eo.y != null ? ao.y - eo.y : undefined,
            unit: 'px',
          };
        }
        if (severity !== 'high') severity = 'medium';
      }

      return {
        ok: okBlur && okColor && okOffset,
        delta: dE,
        unit: 'ΔE',
        expected: exp['box-shadow'],
      };
    });

    // display (normalize inline-flex → flex, inline-grid → grid)
    consider('display', () => {
      const normalize = (v?: string) => {
        if (!v) return v;
        if (v === 'inline-flex') return 'flex';
        if (v === 'inline-grid') return 'grid';
        return v;
      };
      const a = normalize(props['display']);
      const e = exp['display'] ? normalize(exp['display']) : undefined;
      if (!e || !a) return { ok: true };
      return { ok: a === e, expected: exp['display'] };
    });

    // flex-direction (strict equality)
    consider('flex-direction', () => {
      const a = props['flex-direction']?.trim();
      const e = exp['flex-direction']?.trim();
      if (!e || !a) return { ok: true };
      return { ok: a === e, expected: e };
    });

    // flex-wrap, align-content, place-items, place-content (string equality)
    (['flex-wrap', 'align-content', 'place-items', 'place-content'] as const).forEach((p) => {
      consider(p, () => {
        const a = props[p];
        const e = exp[p];
        if (!e || !a) return { ok: true };
        return { ok: a === e, expected: e };
      });
    });

    // justify-content, align-items (normalize start/end → flex-start/flex-end)
    (['justify-content', 'align-items'] as const).forEach((p) => {
      consider(p, () => {
        const normalize = (v?: string) => {
          if (!v) return v;
          return v.replace(/^(start|end)$/, 'flex-$1');
        };
        const a = normalize(props[p]);
        const e = exp[p] ? normalize(exp[p]) : undefined;
        if (!e || !a) return { ok: true };
        return { ok: a === e, expected: exp[p] };
      });
    });

    // grid-template-columns, grid-template-rows, grid-auto-flow (normalize whitespace)
    (['grid-template-columns', 'grid-template-rows', 'grid-auto-flow'] as const).forEach((p) => {
      consider(p, () => {
        const norm = (v?: string) => v?.trim().replace(/\s+/g, ' ');
        const a = norm(props[p]);
        const e = norm(exp[p]);
        if (!e || !a) return { ok: true };
        return { ok: a === e, expected: e };
      });
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
    // Exclude auxiliary properties from patch hints
    if (prop.startsWith('box-shadow-offset-')) continue;
    if (!diff.expected || diff.delta == null) continue;

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
