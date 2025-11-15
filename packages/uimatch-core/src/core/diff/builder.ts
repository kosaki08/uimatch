/**
 * Main style diff builder with comprehensive CSS property comparisons
 */

import type { ExpectedSpec, StyleDiff } from '../../types/index';
import { deltaE2000 } from '../../utils/color';
import {
  normLineHeight,
  parseBoxShadow,
  parseCssColorToRgb,
  toPx,
  type RGB,
} from '../../utils/normalize';
import { getDominantScope, shouldIncludeDiffAtStage } from './scope';
import { calculatePriorityScore, generatePatchHints } from './scoring';
import { isNoiseElement } from './utils';

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
  tokens?: {
    color?: Record<string, string>;
  };
  meta?: Record<
    string,
    {
      tag: string;
      id?: string;
      class?: string;
      testid?: string;
      cssSelector?: string;
      height?: number;
      elementKind?: 'text' | 'interactive' | 'container';
    }
  >;
  /**
   * Checking stage for progressive validation (parent → self → children)
   * @default 'all'
   */
  stage?: 'all' | 'parent' | 'self' | 'children';
}

/**
 * Build style differences between actual and expected styles
 * Supports staged checking (parent → self → children) for progressive validation
 *
 * @param actual Actual styles captured from implementation
 * @param expectedSpec Expected style specification
 * @param opts Diff options (thresholds, ignore, weights, tokens, stage)
 * @returns Array of style differences (filtered by stage if specified)
 */
export function buildStyleDiffs(
  actual: Record<string, Record<string, string>>,
  expectedSpec: ExpectedSpec,
  opts: DiffOptions = {}
): StyleDiff[] {
  const diffs: StyleDiff[] = [];
  const ignore = new Set(opts.ignore ?? []);
  const stage = opts.stage ?? 'all';

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
    // Per-side border properties
    if (/^border-(top|right|bottom|left)-color$/.test(prop)) return ['color'];
    if (/^border-(top|right|bottom|left)-(width|style)$/.test(prop)) return ['border'];

    if (
      /^font-/.test(prop) ||
      prop === 'line-height' ||
      prop === 'font-weight' ||
      prop === 'letter-spacing'
    )
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
    // Filter out noise elements (non-visible or decorative)
    if (isNoiseElement(sel, props, opts.meta?.[sel])) continue;

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
      // Skip properties without expected value (not in spec)
      if (r.expected === undefined) return;
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

    // width / height (escalate to high severity on large relative errors)
    (['width', 'height'] as const).forEach((p) => {
      consider(p, () => {
        const a = toPx(props[p]);
        const e = exp[p] ? toPx(exp[p]) : undefined;
        if (e == null) return { ok: true };
        if (a == null) return { ok: false, expected: `${e}px` };
        const tol = Math.max(1, tDimension * e);
        const ok = Math.abs(a - e) <= tol;
        if (!ok) {
          const rel = Math.abs(a - e) / Math.max(1, e);
          if (rel >= 0.2) severity = 'high'; // large relative error → escalate
        }
        return { ok, delta: a - e, unit: 'px', expected: `${e}px` };
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

    // font-family (compare first family normalized)
    consider('font-family', () => {
      const norm = (v?: string) =>
        v
          ?.split(',')
          .map((s) =>
            s
              .trim()
              .replace(/^['"]|['"]$/g, '')
              .toLowerCase()
          )
          .filter(Boolean)[0];
      const a = norm(props['font-family']);
      const e = norm(exp['font-family']);
      if (!a || !e) return { ok: true };
      const ok = a === e;
      return { ok, expected: exp['font-family'], unit: 'categorical', delta: ok ? 0 : 1 };
    });

    // letter-spacing (px; "normal" => 0)
    consider('letter-spacing', () => {
      const parse = (v?: string) => (v?.trim() === 'normal' ? 0 : toPx(v));
      const a = parse(props['letter-spacing']);
      const e = exp['letter-spacing'] ? parse(exp['letter-spacing']) : undefined;
      if (e == null || a == null) return { ok: true };
      const tol = Math.max(0.5, 0.2 * Math.abs(e)); // min 0.5px or 20%
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // colors (color, background-color, border-color)
    // NOTE: For style comparison, we preserve transparency to detect design intent differences
    // (e.g., text button with transparent bg vs filled button). Pixel comparison still flattens
    // transparent to white for consistent rendering comparison.
    (['color', 'background-color', 'border-color'] as const).forEach((p) => {
      consider(p, () => {
        const aRgb = parseCssColorToRgb(props[p]);
        const ref = exp[p];
        if (!aRgb || !ref) return { ok: true };

        // Detect TEXT element with background-color expectation but no color expectation
        // This likely indicates Figma TEXT fill being misinterpreted as background
        const isTextElement = opts.meta?.[sel]?.elementKind === 'text';
        const isTextTag = /^(p|h[1-6]|span|a|label|li|strong|em|code)$/i.test(
          opts.meta?.[sel]?.tag ?? ''
        );
        if ((isTextElement || isTextTag) && p === 'background-color' && !exp['color']) {
          // Likely misinterpreted TEXT fill as background-color
          // Suppress or downgrade this comparison (return ok: true to skip)
          // The correct expectation should be in 'color' property
          return { ok: true };
        }

        // Do NOT flatten transparent background-color in style comparison
        // to preserve design intent (text button vs filled button distinction)

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

    // border-width (shorthand)
    consider('border-width', () => {
      const a = toPx(props['border-width']);
      const e = exp['border-width'] ? toPx(exp['border-width']) : undefined;
      if (e == null || a == null) return { ok: true };
      const tol = Math.max(1, tBorderWidth * e);
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // border-width per-side (to detect border-bottom vs all-sides difference)
    (
      [
        'border-top-width',
        'border-right-width',
        'border-bottom-width',
        'border-left-width',
      ] as const
    ).forEach((p) => {
      consider(p, () => {
        const a = toPx(props[p]);
        const e = exp[p] ? toPx(exp[p]) : undefined;
        if (e == null || a == null) return { ok: true };
        const tol = Math.max(1, tBorderWidth * e);
        return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
      });
    });

    // border-style (shorthand)
    consider('border-style', () => {
      const a = props['border-style']?.trim();
      const e = exp['border-style']?.trim();
      if (!e || !a) return { ok: true };
      const ok = a === e;
      return { ok, expected: e, unit: 'categorical', delta: ok ? 0 : 1 };
    });

    // border-style per-side
    (
      [
        'border-top-style',
        'border-right-style',
        'border-bottom-style',
        'border-left-style',
      ] as const
    ).forEach((p) => {
      consider(p, () => {
        const a = props[p]?.trim();
        const e = exp[p]?.trim();
        if (!e || !a) return { ok: true };
        const ok = a === e;
        return { ok, expected: e, unit: 'categorical', delta: ok ? 0 : 1 };
      });
    });

    // border-color per-side
    (
      [
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
      ] as const
    ).forEach((p) => {
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

    // spacing (padding and margin properties)
    // escalate to high severity on huge spacing mismatches
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
        const ok = Math.abs(a - e) <= tol;
        if (!ok) {
          const rel = Math.abs(a - e) / Math.max(1, e);
          if (rel >= 0.35) severity = 'high'; // huge spacing mismatch
        }
        return { ok, delta: a - e, unit: 'px', expected: `${e}px` };
      });
    });

    // gap, column-gap, row-gap (configurable tolerance for AA/subpixel errors)
    // 'normal' → 0px for flex default
    // escalate to high severity on large relative errors
    const toGapPx = (v?: string) => (v?.trim() === 'normal' ? 0 : toPx(v));
    (['gap', 'column-gap', 'row-gap'] as const).forEach((p) => {
      consider(p, () => {
        const a = toGapPx(props[p]);
        const e = exp[p] ? toGapPx(exp[p]) : undefined;
        if (e == null || a == null) return { ok: true };
        const tol = Math.max(1, tLayoutGap * e);
        const ok = Math.abs(a - e) <= tol;
        if (!ok) {
          const rel = Math.abs(a - e) / Math.max(1, e);
          if (rel >= 0.3) severity = 'high'; // large layout gap mismatch
        }
        return { ok, delta: a - e, unit: 'px', expected: `${e}px` };
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
      const ok = a === e;
      return { ok, expected: exp['display'], unit: 'categorical', delta: ok ? 0 : 1 };
    });

    // flex-direction (strict equality)
    consider('flex-direction', () => {
      const a = props['flex-direction']?.trim();
      const e = exp['flex-direction']?.trim();
      if (!e || !a) return { ok: true };
      const ok = a === e;
      return { ok, expected: e, unit: 'categorical', delta: ok ? 0 : 1 };
    });

    // flex-wrap, align-content, place-items, place-content (string equality)
    (['flex-wrap', 'align-content', 'place-items', 'place-content'] as const).forEach((p) => {
      consider(p, () => {
        const a = props[p];
        const e = exp[p];
        if (!e || !a) return { ok: true };
        const ok = a === e;
        return { ok, expected: e, unit: 'categorical', delta: ok ? 0 : 1 };
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
        const ok = a === e;
        return { ok, expected: exp[p], unit: 'categorical', delta: ok ? 0 : 1 };
      });
    });

    // grid-template-columns, grid-template-rows, grid-auto-flow (normalize whitespace)
    (['grid-template-columns', 'grid-template-rows', 'grid-auto-flow'] as const).forEach((p) => {
      consider(p, () => {
        const norm = (v?: string) => v?.trim().replace(/\s+/g, ' ');
        const a = norm(props[p]);
        const e = norm(exp[p]);
        if (!e || !a) return { ok: true };
        const ok = a === e;
        return { ok, expected: e, unit: 'categorical', delta: ok ? 0 : 1 };
      });
    });

    // text-align, text-transform, text-decoration-line, white-space, word-break (string equality)
    (
      ['text-align', 'text-transform', 'text-decoration-line', 'white-space', 'word-break'] as const
    ).forEach((p) => {
      consider(p, () => {
        const a = props[p]?.trim();
        const e = exp[p]?.trim();
        if (!e || !a) return { ok: true };
        const ok = a === e;
        return { ok, expected: e, unit: 'categorical', delta: ok ? 0 : 1 };
      });
    });

    // sizing constraints (min-width, max-width, min-height, max-height)
    (['min-width', 'max-width', 'min-height', 'max-height'] as const).forEach((p) => {
      consider(p, () => {
        const a = toPx(props[p]);
        const e = exp[p] ? toPx(exp[p]) : undefined;
        if (e == null || a == null) return { ok: true };
        // same tolerance as dimension (5%) with min 1px
        const tol = Math.max(1, tDimension * e);
        return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
      });
    });

    // box-sizing (string equality)
    consider('box-sizing', () => {
      const a = props['box-sizing']?.trim();
      const e = exp['box-sizing']?.trim();
      if (!e || !a) return { ok: true };
      const ok = a === e;
      return { ok, expected: e, unit: 'categorical', delta: ok ? 0 : 1 };
    });

    // overflow-x, overflow-y (string equality)
    (['overflow-x', 'overflow-y'] as const).forEach((p) => {
      consider(p, () => {
        const a = props[p]?.trim();
        const e = exp[p]?.trim();
        if (!e || !a) return { ok: true };
        const ok = a === e;
        return { ok, expected: e, unit: 'categorical', delta: ok ? 0 : 1 };
      });
    });

    // flex-grow, flex-shrink (numeric tolerance)
    (['flex-grow', 'flex-shrink'] as const).forEach((p) => {
      consider(p, () => {
        const toNum = (v?: string) => (v && !isNaN(Number(v)) ? Number(v) : undefined);
        const a = toNum(props[p]);
        const e = exp[p] ? toNum(exp[p]) : undefined;
        if (e == null || a == null) return { ok: true };
        const tol = 0.1; // small numeric tolerance
        return {
          ok: Math.abs(a - e) <= tol,
          delta: +(a - e).toFixed(2),
          unit: '',
          expected: String(e),
        };
      });
    });

    // flex-basis (dimension with px conversion)
    consider('flex-basis', () => {
      const a = toPx(props['flex-basis']);
      const e = exp['flex-basis'] ? toPx(exp['flex-basis']) : undefined;
      if (e == null || a == null) return { ok: true };
      const tol = Math.max(1, tDimension * e);
      return { ok: Math.abs(a - e) <= tol, delta: a - e, unit: 'px', expected: `${e}px` };
    });

    // opacity (numeric with small tolerance)
    consider('opacity', () => {
      const a = Number(props['opacity']);
      const e = exp['opacity'] ? Number(exp['opacity']) : undefined;
      if (isNaN(a) || e == null || isNaN(e)) return { ok: true };
      const tol = 0.05;
      return {
        ok: Math.abs(a - e) <= tol,
        delta: +(a - e).toFixed(2),
        unit: '',
        expected: String(e),
      };
    });

    // Generate patch hints
    const patchHints = generatePatchHints(propDiffs);

    // Calculate priority score
    const priorityScore = calculatePriorityScore(propDiffs, severity, opts.meta?.[sel]);

    // Extract actual CSS selector for the element
    const selectorDisplay = opts.meta?.[sel]?.cssSelector ?? (sel === '__self__' ? 'self' : sel);

    // Determine dominant scope for this diff
    const scope = getDominantScope(propDiffs);

    // Check if this diff should be included at the current stage
    if (!shouldIncludeDiffAtStage(scope, stage)) {
      continue;
    }

    diffs.push({
      selector: selectorDisplay,
      properties: propDiffs,
      severity,
      patchHints,
      autoFixable: patchHints !== undefined && patchHints.length > 0,
      meta: opts.meta?.[sel],
      priorityScore,
      scope,
    });
  }

  // Sort diffs by scope first (ancestor → self → descendant), then by priority score
  return diffs.sort((a, b) => {
    // Primary sort: scope (ancestor < self < descendant for ordering)
    const scopeOrder = { ancestor: 0, self: 1, descendant: 2 } as const;
    const scopeDiff = (scopeOrder[a.scope ?? 'self'] ?? 1) - (scopeOrder[b.scope ?? 'self'] ?? 1);
    if (scopeDiff !== 0) return scopeDiff;

    // Secondary sort: priority score (descending)
    return (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
  });
}
