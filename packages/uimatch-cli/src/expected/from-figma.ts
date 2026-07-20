import type {
  ExpectedSpec,
  FigmaExpectedSpec,
  FigmaRootDimensionConstraint,
  TokenMap,
} from '../types/index.js';

/**
 * Minimal Figma node shapes we care about (partial & tolerant)
 */
type FigmaColor = { r: number; g: number; b: number; a?: number };
type FigmaPaint = { type?: string; visible?: boolean; color?: FigmaColor };
type FigmaEffect = {
  type?: string;
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x?: number; y?: number };
  radius?: number;
  spread?: number;
};
type FigmaLayoutSizing = 'FILL' | 'FIXED' | 'HUG';
type FigmaLegacyAxisSizing = 'AUTO' | 'FIXED';

export interface FigmaNodeLite {
  type?: string;
  name?: string;
  // Fills / strokes
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  // Corners
  cornerRadius?: number;
  rectangleCornerRadii?: number[]; // [top-left, top-right, bottom-right, bottom-left]
  // Effects
  effects?: FigmaEffect[];
  // Auto layout
  layoutMode?: string;
  layoutSizingHorizontal?: FigmaLayoutSizing;
  layoutSizingVertical?: FigmaLayoutSizing;
  primaryAxisSizingMode?: FigmaLegacyAxisSizing;
  counterAxisSizingMode?: FigmaLegacyAxisSizing;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
  // Typography (for TEXT nodes)
  style?: {
    fontSize?: number;
    fontWeight?: number;
    lineHeightPx?: number;
    letterSpacing?: number; // px in REST
    fontFamily?: string;
    textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  };
  // Dimensions
  absoluteBoundingBox?: { width?: number; height?: number };
  // Children
  children?: FigmaNodeLite[];
}

const px = (n?: number): string | undefined =>
  typeof n === 'number' && isFinite(n) ? `${Math.round(n)}px` : undefined;

function colorToCss(c?: FigmaColor): string | undefined {
  if (!c) return undefined;
  const r = Math.round((c.r ?? 0) * 255);
  const g = Math.round((c.g ?? 0) * 255);
  const b = Math.round((c.b ?? 0) * 255);
  const a = typeof c.a === 'number' ? c.a : 1;
  if (a >= 0.999) {
    // hex
    const to2 = (v: number) => v.toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`;
}

function maybeTokenize(value: string | undefined, tokens?: TokenMap): string | undefined {
  if (!value || !tokens) return value;
  // color tokens only for now
  const color = tokens.color;
  if (color) {
    for (const [token, hex] of Object.entries(color)) {
      if (hex && typeof hex === 'string' && hex.toLowerCase() === value.toLowerCase()) {
        return `var(${token})`;
      }
    }
  }
  return value;
}

function mapAutoLayoutAlign(v?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'): string | undefined {
  switch (v) {
    case 'MIN':
      return 'flex-start';
    case 'CENTER':
      return 'center';
    case 'MAX':
      return 'flex-end';
    case 'SPACE_BETWEEN':
      return 'space-between';
    default:
      return undefined;
  }
}

type RootDimensionAxis = FigmaRootDimensionConstraint['axis'];

function observedDimension(node: FigmaNodeLite, axis: RootDimensionAxis): number | undefined {
  const value =
    axis === 'horizontal' ? node.absoluteBoundingBox?.width : node.absoluteBoundingBox?.height;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveDimensionConstraint(
  node: FigmaNodeLite,
  axis: RootDimensionAxis
): FigmaRootDimensionConstraint {
  const observedPx = observedDimension(node, axis);
  const sizing = axis === 'horizontal' ? node.layoutSizingHorizontal : node.layoutSizingVertical;
  if (sizing === 'FILL' || sizing === 'FIXED' || sizing === 'HUG') {
    return {
      axis,
      mode: sizing,
      ...(observedPx === undefined ? {} : { observedPx }),
      source: 'layout-sizing',
    };
  }
  if (sizing !== undefined) {
    throw new TypeError(`Unsupported Figma ${axis} sizing: ${String(sizing)}`);
  }

  if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
    const isPrimaryAxis =
      (axis === 'horizontal' && node.layoutMode === 'HORIZONTAL') ||
      (axis === 'vertical' && node.layoutMode === 'VERTICAL');
    const legacySizing = isPrimaryAxis ? node.primaryAxisSizingMode : node.counterAxisSizingMode;
    if (legacySizing === 'FIXED' || legacySizing === 'AUTO') {
      return {
        axis,
        mode: legacySizing === 'FIXED' ? 'FIXED' : 'HUG',
        ...(observedPx === undefined ? {} : { observedPx }),
        source: 'legacy-axis-sizing',
      };
    }
    if (legacySizing !== undefined) {
      throw new TypeError(`Unsupported legacy Figma ${axis} sizing: ${String(legacySizing)}`);
    }
  }

  return {
    axis,
    mode: 'UNKNOWN',
    ...(observedPx === undefined ? {} : { observedPx }),
    source: node.layoutMode === 'NONE' ? 'non-auto-layout' : 'compatibility-fallback',
  };
}

/**
 * Build a minimal ExpectedSpec from a Figma node.
 * Only "robust" properties are filled to avoid false positives.
 */
function build(
  node: FigmaNodeLite,
  path: string,
  spec: ExpectedSpec,
  tokens?: TokenMap,
  rootDimensionConstraints?: readonly FigmaRootDimensionConstraint[]
) {
  const n = node;
  const S = (spec[path] ||= {});

  // ===== Colors (fill / stroke) =====
  const fills = Array.isArray(n.fills) ? n.fills : [];
  const strokes = Array.isArray(n.strokes) ? n.strokes : [];
  const solidFill = fills.find((p) => (p.visible ?? true) && p.type === 'SOLID' && p.color);
  const solidStroke = strokes.find((p) => (p.visible ?? true) && p.type === 'SOLID' && p.color);
  const fillCss = maybeTokenize(colorToCss(solidFill?.color), tokens);
  const strokeCss = maybeTokenize(colorToCss(solidStroke?.color), tokens);

  // For TEXT nodes: fill → color (text color), not background-color
  // For shape/frame nodes: fill → background-color
  if (fillCss) {
    if (n.type === 'TEXT') {
      S['color'] = fillCss;
    } else {
      S['background-color'] = fillCss;
    }
  }

  // For TEXT nodes: stroke is typically text-stroke (not CSS border), so we skip it
  // For shape/frame nodes: stroke → border-color
  if (n.type !== 'TEXT' && strokeCss) {
    S['border-color'] = strokeCss;
    if (typeof n.strokeWeight === 'number') {
      const borderWidth = px(n.strokeWeight);
      if (borderWidth) S['border-width'] = borderWidth;
    }
  }

  // ===== Corners =====
  if (Array.isArray(n.rectangleCornerRadii) && n.rectangleCornerRadii.length === 4) {
    const [tl, tr, br, bl] = n.rectangleCornerRadii;
    if (tl === tr && tr === br && br === bl) {
      const radius = px(tl);
      if (radius) S['border-radius'] = radius;
    }
  } else if (typeof n.cornerRadius === 'number') {
    const radius = px(n.cornerRadius);
    if (radius) S['border-radius'] = radius;
  }

  // ===== Shadow (first visible drop shadow) =====
  const effects = Array.isArray(n.effects) ? n.effects : [];
  const drop = effects.find((e) => (e.visible ?? true) && e.type?.includes('SHADOW'));
  if (drop) {
    const ox = px(drop.offset?.x ?? 0) ?? '0px';
    const oy = px(drop.offset?.y ?? 0) ?? '0px';
    const blur = px(drop.radius ?? 0) ?? '0px';
    const col = colorToCss(drop.color) ?? 'rgba(0,0,0,0.25)';
    S['box-shadow'] = `${ox} ${oy} ${blur} ${col}`;
  }

  // ===== Auto Layout → flex direction / gap / padding / alignment =====
  if (n.layoutMode && n.layoutMode !== 'NONE') {
    S['display'] = 'flex';
    if (n.layoutMode === 'HORIZONTAL') S['flex-direction'] = 'row';
    if (n.layoutMode === 'VERTICAL') S['flex-direction'] = 'column';
    if (typeof n.itemSpacing === 'number') {
      const gap = px(n.itemSpacing);
      if (gap) S['gap'] = gap;
    }
    if (typeof n.paddingTop === 'number') {
      const paddingTop = px(n.paddingTop);
      if (paddingTop) S['padding-top'] = paddingTop;
    }
    if (typeof n.paddingRight === 'number') {
      const paddingRight = px(n.paddingRight);
      if (paddingRight) S['padding-right'] = paddingRight;
    }
    if (typeof n.paddingBottom === 'number') {
      const paddingBottom = px(n.paddingBottom);
      if (paddingBottom) S['padding-bottom'] = paddingBottom;
    }
    if (typeof n.paddingLeft === 'number') {
      const paddingLeft = px(n.paddingLeft);
      if (paddingLeft) S['padding-left'] = paddingLeft;
    }
    const jc = mapAutoLayoutAlign(n.primaryAxisAlignItems);
    const ai = mapAutoLayoutAlign(n.counterAxisAlignItems);
    if (jc) S['justify-content'] = jc;
    if (ai) S['align-items'] = ai;
  }

  // ===== Typography (for TEXT node only; optional) =====
  if (n.type === 'TEXT' && n.style) {
    if (typeof n.style.fontSize === 'number') {
      const fontSize = px(n.style.fontSize);
      if (fontSize) S['font-size'] = fontSize;
    }
    if (typeof n.style.lineHeightPx === 'number') {
      const lineHeight = px(n.style.lineHeightPx);
      if (lineHeight) S['line-height'] = lineHeight;
    }
    if (typeof n.style.fontWeight === 'number') S['font-weight'] = String(n.style.fontWeight);
    if (typeof n.style.letterSpacing === 'number') {
      const letterSpacing = px(n.style.letterSpacing);
      if (letterSpacing) S['letter-spacing'] = letterSpacing;
    }
    if (n.style.fontFamily) S['font-family'] = n.style.fontFamily;
    // Text decoration
    if (n.style.textDecoration === 'UNDERLINE') {
      S['text-decoration-line'] = 'underline';
    }
  }

  // ===== Fixed dimensions =====
  // A bounding box is an observation for HUG/FILL sizing, not a fixed design constraint.
  // Missing sizing metadata retains the legacy behavior for non-auto-layout and older inputs.
  if (rootDimensionConstraints) {
    const horizontal = rootDimensionConstraints.find(({ axis }) => axis === 'horizontal');
    const vertical = rootDimensionConstraints.find(({ axis }) => axis === 'vertical');
    if (horizontal && (horizontal.mode === 'FIXED' || horizontal.mode === 'UNKNOWN')) {
      const width = horizontal.observedPx ? px(horizontal.observedPx) : undefined;
      if (width) S['width'] = width;
    }
    if (vertical && (vertical.mode === 'FIXED' || vertical.mode === 'UNKNOWN')) {
      const height = vertical.observedPx ? px(vertical.observedPx) : undefined;
      if (height) S['height'] = height;
    }
  }

  // ===== Recurse into Children =====
  const kids = Array.isArray(n.children) ? n.children : [];
  if (n.layoutMode && n.layoutMode !== 'NONE' && kids.length > 0) {
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      if (child) {
        build(child, `${path} > :nth-child(${i + 1})`, spec, tokens);
      }
    }
  }
}

export function buildExpectedSpecFromFigma(
  node: Record<string, unknown>,
  tokens?: TokenMap
): ExpectedSpec {
  return buildExpectedSpecFromFigmaWithMetadata(node, tokens).expectedSpec;
}

export function buildExpectedSpecFromFigmaWithMetadata(
  node: Record<string, unknown>,
  tokens?: TokenMap
): FigmaExpectedSpec {
  const spec: ExpectedSpec = {};
  const figmaNode = node as FigmaNodeLite;
  const rootDimensionConstraints = [
    resolveDimensionConstraint(figmaNode, 'horizontal'),
    resolveDimensionConstraint(figmaNode, 'vertical'),
  ];
  build(figmaNode, '__self__', spec, tokens, rootDimensionConstraints);
  return { expectedSpec: spec, rootDimensionConstraints };
}
